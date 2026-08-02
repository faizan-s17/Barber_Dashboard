import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useBranding } from '../ShopContext'
import { toast } from '../components/Toast'
import Icon from '../components/Icon'

const TZ = 'Europe/London'
const fmt = iso => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

// Plain English for what the caller was after.
// Keys are the `route` values the workflow actually emits — the previous map keyed on
// "booking", which never matches, so the commonest case fell through to the raw enum.
const WANTED = {
  book_appointment:       'Wanted to book',
  check_availability:     'Asked what was free',
  lookup_appointment:     'Checking their booking',
  reschedule_appointment: 'Wanted to move a booking',
  cancel_appointment:     'Wanted to cancel',
  walk_in_today:          'Asked to come in today',
  join_waitlist:          'Joined the waiting list',
  shop_hours:             'Asked about opening times',
  shop_location:          'Asked where you are',
  faq:                    'Asked a question',
  request_human:          'Asked to speak to someone',
  booking_stub:           'Something else',
}

// What came of it. `handled_by` wins over `outcome` — a caller who ended up
// speaking to a person is the thing the shop actually cares about.
function result(call) {
  if (call.handled_by === 'missed')      return { label: 'Missed',           cls: 'badge-red'   }
  if (call.handled_by === 'transferred') return { label: 'Passed to you',    cls: 'badge-amber' }
  if (call.handled_by === 'voicemail')   return { label: 'Left a message',   cls: 'badge-gray'  }
  switch (call.outcome) {
    case 'booked':      return { label: 'Booked in',   cls: 'badge-green' }
    case 'cancelled':   return { label: 'Cancelled',   cls: 'badge-red'   }
    case 'rescheduled': return { label: 'Moved',       cls: 'badge-blue'  }
    case 'failed':      return { label: 'Didn’t finish', cls: 'badge-red' }
    default:            return { label: 'Answered',    cls: 'badge-gray'  }
  }
}

function length(sec) {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

export default function Calls({ isAdmin }) {
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [filter,     setFilter]     = useState('all')
  const [exportOpen, setExportOpen] = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [detail,     setDetail]     = useState(null)
  const brand = useBranding()

  async function syncCalls() {
    setSyncing(true)
    const { data, error } = await supabase.functions.invoke('sync-dograh-calls')
    setSyncing(false)
    if (error || data?.error) {
      toast.error('Sync failed: ' + (data?.error || error.message))
      return
    }
    toast.success(data.inserted > 0 ? `Added ${data.inserted} new call${data.inserted !== 1 ? 's' : ''}` : 'No new calls')
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('call_logs').select('*')
        .order('created_at', { ascending: false }).limit(200)
      setLogs(data || [])
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('calls-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' },
        ({ new: row }) => setLogs(prev => [row, ...prev].slice(0, 200)))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const needsYou = l => l.handled_by === 'transferred' || l.handled_by === 'missed' || l.outcome === 'failed'

  const filtered = logs.filter(l => {
    if (filter === 'booked'  && l.outcome !== 'booked') return false
    if (filter === 'attention' && !needsYou(l)) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return l.caller_name?.toLowerCase().includes(q)
      || l.caller_phone?.includes(q)
      || l.booking_id?.toLowerCase().includes(q)
      || (WANTED[l.intent] || '').toLowerCase().includes(q)
  })

  function exportCSV() {
    const headers = ['When', 'Caller', 'Phone', 'What they wanted', 'Result', 'Length', 'Booking ref']
    const rows = filtered.map(l => [
      fmt(l.created_at), l.caller_name || '', l.caller_phone || '',
      WANTED[l.intent] || l.intent || '', result(l).label, length(l.duration_seconds), l.booking_id || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`))
    const csv = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `phone-calls-${new Date().toISOString().slice(0, 10)}.csv`,
    })
    a.click(); URL.revokeObjectURL(a.href)
  }

  function exportPDF() {
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const rows = filtered.map(l => `
      <tr>
        <td style="white-space:nowrap">${esc(fmt(l.created_at))}</td>
        <td>${esc(l.caller_name || 'Unknown')}</td>
        <td>${esc(l.caller_phone || '—')}</td>
        <td>${esc(WANTED[l.intent] || l.intent || '—')}</td>
        <td>${esc(result(l).label)}</td>
        <td>${esc(l.booking_id || '—')}</td>
      </tr>`).join('')
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Phone Calls</title><style>
      body{font-family:sans-serif;font-size:12px;padding:24px;color:#111}
      h1{font-size:18px;margin-bottom:4px}
      .meta{color:#666;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th{background:#18181b;color:#ffffff;padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase}
      td{padding:6px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top}
      tr:nth-child(even) td{background:#f9f9f9}
    </style></head><body>
      <h1>Phone Calls — ${esc(brand.name)}</h1>
      <div class="meta">${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${filtered.length} call${filtered.length !== 1 ? 's' : ''}</div>
      <table><thead><tr><th>When</th><th>Caller</th><th>Phone</th><th>What they wanted</th><th>Result</th><th>Ref</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </body></html>`)
    w.document.close(); w.print()
  }

  const booked    = logs.filter(l => l.outcome === 'booked').length
  const attention = logs.filter(needsYou).length

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Phone Calls</h1>
          <div className="topbar-sub">Who rang, what they wanted, and what happened</div>
        </div>
      </div>

      <div className="page">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Calls answered</div>
            <div className="stat-value">{logs.length}</div>
            <div className="stat-sub">most recent 200</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Turned into bookings</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{booked}</div>
            <div className="stat-sub">
              {logs.length ? `${Math.round(booked / logs.length * 100)} out of every 100 callers` : 'no calls yet'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Needed you</div>
            <div className="stat-value" style={{ color: attention ? 'var(--amber)' : 'var(--gold)' }}>{attention}</div>
            <div className="stat-sub">{attention ? 'worth a look' : 'all handled on their own'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <label htmlFor="calls-search" className="sr-only">Search calls</label>
          <input
            id="calls-search" type="search"
            placeholder="Search by name, number or booking ref…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 300, maxWidth: '100%' }}
          />
          <div className="segment" role="group" aria-label="Filter calls">
            {[['all', 'All'], ['booked', 'Booked in'], ['attention', 'Needed you']].map(([id, label]) => (
              <button key={id} className={filter === id ? 'on' : ''}
                      aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={syncCalls} disabled={syncing}>
              <Icon name="refresh" size={14} /> {syncing ? 'Syncing…' : 'Sync recent calls'}
            </button>
          )}
          <div className="dropdown">
            <button className="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={exportOpen}
                    onClick={() => setExportOpen(o => !o)}>
              <Icon name="download" size={14} /> Export
            </button>
            {exportOpen && (
              <div className="dropdown-menu" role="menu" onMouseLeave={() => setExportOpen(false)}>
                <button role="menuitem" className="dropdown-item" onClick={() => { exportCSV(); setExportOpen(false) }}>Spreadsheet (CSV)</button>
                <button role="menuitem" className="dropdown-item" onClick={() => { exportPDF(); setExportOpen(false) }}>Print / PDF</button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="table-wrap" aria-busy="true" aria-label="Loading calls">
            <div style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 34 }} />)}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="e-icon"><Icon name="phone" size={30} /></div>
            {logs.length === 0
              ? 'No calls yet. When someone rings, you’ll see it here.'
              : 'No calls match what you searched for.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Caller</th>
                  <th scope="col">What they wanted</th>
                  <th scope="col">Result</th>
                  <th scope="col" className="hide-mobile">Length</th>
                  <th scope="col" className="hide-mobile">Booking</th>
                  <th scope="col">When</th>
                  <th scope="col" aria-label="Recording" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const r = result(l)
                  return (
                    <tr key={l.id} onClick={() => setDetail(l)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {l.caller_name || <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>Unknown caller</span>}
                        </div>
                        {l.caller_phone && (
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>{l.caller_phone}</div>
                        )}
                      </td>
                      <td>{WANTED[l.intent] || 'Something else'}</td>
                      <td><span className={`badge ${r.cls}`}>{r.label}</span></td>
                      <td className="hide-mobile" style={{ color: 'var(--text-muted)' }}>{length(l.duration_seconds)}</td>
                      <td className="hide-mobile">
                        {l.booking_id
                          ? <span className="mono" style={{ color: 'var(--gold)' }}>{l.booking_id}</span>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap', fontSize: 'var(--fs-xs)' }}>{fmt(l.created_at)}</td>
                      <td>
                        {l.recording_url && <Icon name="phone" size={14} style={{ color: 'var(--gold)' }} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ padding: 'var(--sp-3) var(--sp-4)', fontSize: 'var(--fs-xs)', color: 'var(--text-dim)' }}>
              {filtered.length} call{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16 }}>Call Details</h2>
              <button className="modal-close" onClick={() => setDetail(null)}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${result(detail).cls}`}>{result(detail).label}</span>
              </div>
              {[
                ['Caller',   detail.caller_name],
                ['Phone',    detail.caller_phone],
                ['Wanted',   WANTED[detail.intent] || 'Something else'],
                ['Length',   length(detail.duration_seconds)],
                ['Booking',  detail.booking_id],
                ['When',     fmt(detail.created_at)],
                ['Notes',    detail.notes],
              ].map(([label, val]) => val && (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', paddingTop: 1 }}>{label}</span>
                  <span style={{ color: 'var(--text)' }}>{val}</span>
                </div>
              ))}

              {detail.recording_url && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Recording</div>
                  <audio controls src={detail.recording_url} style={{ width: '100%' }} />
                </div>
              )}

              {detail.transcript && (
                <div style={{ marginTop: 4 }}>
                  <a href={detail.transcript} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex' }}>
                    View transcript ↗
                  </a>
                </div>
              )}

              {!detail.recording_url && !detail.transcript && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>No recording or transcript available for this call.</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
