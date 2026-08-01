import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import Icon from '../components/Icon'

const TZ = 'Europe/London'
function ago(iso) {
  if (!iso) return 'never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}
const fmt = iso => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const OUTCOME_ICON = { booked: 'checkCircle', cancelled: 'xCircle', rescheduled: 'swap', info: 'bell', failed: 'alert' }

export default function AutomationHealth() {
  const [logs,        setLogs]        = useState([])
  const [supaOk,      setSupaOk]      = useState(true)
  const [lastBooking, setLastBooking] = useState(null)
  const [lastCall,    setLastCall]    = useState(null)
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [cl, appt, call] = await Promise.all([
      supabase.from('call_logs').select('*').order('created_at', { ascending: false }).limit(40),
      supabase.from('appointments').select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('call_logs').select('created_at').order('created_at', { ascending: false }).limit(1),
    ])
    setSupaOk(!cl.error)
    setLogs(cl.data || [])
    setLastBooking(appt.data?.[0]?.created_at || null)
    setLastCall(call.data?.[0]?.created_at || null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('barber-health-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' }, ({ new: row }) => {
        setLogs(prev => [row, ...prev].slice(0, 40))
        setLastCall(row.created_at)
        if (row.outcome === 'booked') setLastBooking(row.created_at)
        setSupaOk(true)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments' }, ({ new: row }) => {
        setLastBooking(row.created_at)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  const weekAgo = Date.now() - 7 * 86400 * 1000
  const recentFailed = logs.filter(l => l.outcome === 'failed' && new Date(l.created_at).getTime() > weekAgo)

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Automation Health</h1>
          <div className="topbar-sub">Live status of the AI receptionist pipeline
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }} onClick={load}><Icon name="refresh" size={13} style={{ marginRight: 5 }} />Refresh</button>
          </div>
        </div>
      </div>

      <div className="page">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
          <StatusCard title="Supabase Database"    ok={supaOk}          okText="Connected"   badText="Unreachable"    sub={supaOk ? 'Read/write OK' : 'Check project'} />
          <StatusCard title="Vapi Voice Webhook"   ok={!!lastCall}      okText="Receiving"   badText="No calls yet"   sub={lastCall ? `Last call ${ago(lastCall)}` : 'Waiting for first call'} />
          <StatusCard title="Booking AI"           ok={!!lastBooking}   okText="Booking"     badText="No bookings yet" sub={lastBooking ? `Last booking ${ago(lastBooking)}` : 'No bookings logged'} />
          <StatusCard title="Failed Calls (7d)"    ok={recentFailed.length === 0} okText="All healthy" badText={`${recentFailed.length} failed`} sub={recentFailed.length ? 'needs review' : 'no issues'} />
        </div>

        <div className="stats-grid" style={{ marginBottom: 18 }}>
          <div className="stat-card">
            <div className="stat-label">Last Booking</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{lastBooking ? ago(lastBooking) : '—'}</div>
            <div className="stat-sub">{fmt(lastBooking)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Last Call Logged</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{lastCall ? ago(lastCall) : '—'}</div>
            <div className="stat-sub">{fmt(lastCall)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Calls (logged)</div>
            <div className="stat-value">{logs.length > 0 ? logs.length : '—'}</div>
            <div className="stat-sub">last 40 shown</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Failed Calls (7d)</div>
            <div className="stat-value" style={{ color: recentFailed.length ? 'var(--red)' : 'var(--gold)' }}>{recentFailed.length}</div>
            <div className="stat-sub">{recentFailed.length ? 'needs review' : 'all healthy'}</div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="activity" size={17} /> Recent Call Log</div>
          {loading ? (
            <div className="empty-state"><div className="e-icon"><Icon name="loader" size={28} className="spin" /></div>Loading…</div>
          ) : logs.length === 0 ? (
            <div className="empty-state"><div className="e-icon"><Icon name="inbox" size={30} /></div>No calls logged yet. Events appear as the AI receptionist handles calls.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {logs.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 22, display: 'flex', justifyContent: 'center', color: l.outcome === 'failed' ? 'var(--red)' : 'var(--text-muted)' }}>
                    <Icon name={OUTCOME_ICON[l.outcome] || 'phone'} size={16} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{l.caller_name || 'Unknown caller'}{l.caller_phone ? ` · ${l.caller_phone}` : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{l.intent || '—'} · {fmt(l.created_at)}</div>
                    {l.notes && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{l.notes}</div>}
                  </div>
                  <span className={`badge ${l.outcome === 'failed' ? 'badge-red' : l.outcome === 'booked' ? 'badge-green' : 'badge-gray'}`}>{l.outcome || 'logged'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 60, textAlign: 'right' }}>{ago(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function StatusCard({ title, ok, okText, badText, sub }) {
  const color = ok ? 'var(--green)' : 'var(--red)'
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color, marginBottom: 2 }}>{ok ? okText : badText}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}
