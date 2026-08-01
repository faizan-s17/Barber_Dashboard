import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'
import Icon from '../components/Icon'

const TZ = 'Europe/London'
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }) : '—'
const fmtDT   = d => d ? new Date(d).toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

function waitingFor(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

// Plain English. `offered` is a live race for a slot, which is the only state
// where the shop might actually want to look.
const STATUS = {
  waiting:   { label: 'Waiting',      cls: 'badge-gold'  },
  offered:   { label: 'Texted them',  cls: 'badge-blue'  },
  booked:    { label: 'Got a slot',   cls: 'badge-green' },
  expired:   { label: 'Expired',      cls: 'badge-gray'  },
  cancelled: { label: 'Removed',      cls: 'badge-gray'  },
}
const WINDOW_LABEL = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings', any: 'Any time' }

// live countdown on an open offer — the whole point is that it's a race
function Countdown({ expiresAt }) {
  const [left, setLeft] = useState(() => new Date(expiresAt) - Date.now())
  useEffect(() => {
    const t = setInterval(() => setLeft(new Date(expiresAt) - Date.now()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  if (left <= 0) return <span style={{ color: 'var(--text-dim)' }}>expired</span>
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000)
  return (
    <span style={{ fontFamily: 'monospace', color: m < 5 ? 'var(--red)' : 'var(--gold)', fontWeight: 600 }}>
      {m}:{String(s).padStart(2, '0')}
    </span>
  )
}

export default function Waitlist({ isAdmin }) {
  const [rows,    setRows]    = useState([])
  const [offers,  setOffers]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('waiting')

  const load = useCallback(async () => {
    setLoading(true)
    const [wl, of] = await Promise.all([
      supabase.from('barber_waitlist').select('*').order('priority', { ascending: false }).order('created_at'),
      supabase.from('barber_slot_offers').select('*').eq('status', 'open').order('expires_at'),
    ])
    setRows(wl.data || [])
    setOffers(of.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('waitlist-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_waitlist' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_slot_offers' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  async function bump(row, delta) {
    const { error } = await supabase.from('barber_waitlist')
      .update({ priority: (row.priority || 0) + delta }).eq('id', row.id)
    if (error) return toast.error(error.message)
    toast.success(delta > 0 ? `${row.customer_name} moved up` : `${row.customer_name} moved down`)
    load()
  }

  async function remove(row) {
    const { error } = await supabase.from('barber_waitlist')
      .update({ status: 'cancelled' }).eq('id', row.id)
    if (error) return toast.error(error.message)
    toast.success(`${row.customer_name} removed from the list`)
    load()
  }

  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter)
  const counts = {
    waiting: rows.filter(r => r.status === 'waiting').length,
    booked:  rows.filter(r => r.status === 'booked').length,
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Waiting List</h1>
          <div className="topbar-sub">
            Customers hoping for a cancellation. When one frees up they all get a text —
            first to reply gets it.
          </div>
        </div>
      </div>

      <div className="page">

        <div className="stats-grid" style={{ marginBottom: 18 }}>
          <div className="stat-card">
            <div className="stat-label">Waiting right now</div>
            <div className="stat-value">{counts.waiting}</div>
            <div className="stat-sub">{counts.waiting ? 'hoping for a cancellation' : 'nobody waiting'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Slots up for grabs</div>
            <div className="stat-value" style={{ color: offers.length ? 'var(--gold)' : 'var(--text)' }}>{offers.length}</div>
            <div className="stat-sub">{offers.length ? 'texts sent, waiting on a reply' : 'none at the moment'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Empty slots refilled</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{counts.booked}</div>
            <div className="stat-sub">that would have gone to waste</div>
          </div>
        </div>

        {offers.length > 0 && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--gold)' }}>
            <div className="card-title">
              <Icon name="hourglass" size={14} /> Slots up for grabs — first to reply gets it
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {offers.map(o => (
                <div key={o.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center',
                  padding: '8px 10px', background: 'var(--surface2, rgba(255,255,255,.04))', borderRadius: 6,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{o.barber_name} · {fmtDT(o.slot_start)}</div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>texted {fmtDT(o.opened_at)}</div>
                  </div>
                  <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>offer ends in</span>
                  <Countdown expiresAt={o.expires_at} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="segment">
            {[['waiting', 'Still waiting'], ['booked', 'Got a slot'], ['all', 'Everyone']].map(([id, label]) => (
              <button key={id} className={filter === id ? 'on' : ''}
                      aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="table-wrap" aria-busy="true" aria-label="Loading waiting list">
            <div style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 40 }} />)}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="e-icon"><Icon name="hourglass" size={30} /></div>
            {filter === 'waiting'
              ? 'Nobody waiting at the moment. When the AI takes a call and you\'re fully booked, it offers to add them here.'
              : 'Nothing to show yet.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col" className="hide-mobile">Wants</th>
                  <th scope="col">With</th>
                  <th scope="col" className="hide-mobile">When suits them</th>
                  <th scope="col" className="hide-mobile">Waiting</th>
                  <th scope="col">Status</th>
                  {isAdmin && <th scope="col"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 500 }}>{r.customer_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.customer_phone_e164}</div>
                    </td>
                    <td className="hide-mobile" style={{ fontSize: 13 }}>
                      {r.service_name}
                      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}> · {r.service_duration_minutes}m</span>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {r.any_barber
                        ? <span style={{ color: 'var(--text-muted)' }}>Anyone</span>
                        : r.preferred_barber}
                    </td>
                    <td className="hide-mobile" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {fmtDate(r.date_from)}–{fmtDate(r.date_to)}
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{WINDOW_LABEL[r.time_window]}</div>
                    </td>
                    <td className="hide-mobile" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-dim)' }}>
                      {waitingFor(r.created_at)}
                    </td>
                    <td>
                      <span className={`badge ${(STATUS[r.status] || {}).cls || 'badge-gray'}`}>
                        {(STATUS[r.status] || {}).label || r.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.status === 'waiting' && (
                          <>
                            <button className="btn btn-ghost btn-sm" title="Move up"   onClick={() => bump(r, 1)}>↑</button>
                            <button className="btn btn-ghost btn-sm" title="Move down" onClick={() => bump(r, -1)} style={{ marginLeft: 4 }}>↓</button>
                            <button className="btn btn-ghost btn-sm" title="Remove"    onClick={() => remove(r)} style={{ marginLeft: 4 }}>
                              <Icon name="xMark" size={13} />
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '10px 4px', fontSize: 12, color: 'var(--text-dim)' }}>
              {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
