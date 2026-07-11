import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Icon from '../components/Icon'

const TZ = 'Europe/London'
const fmt = iso => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const OUTCOME_COLOR = { booked: 'badge-green', cancelled: 'badge-red', rescheduled: 'badge-blue', info: 'badge-gray', failed: 'badge-red' }
const INTENT_LABEL  = { booking: 'Book', cancel_appointment: 'Cancel', reschedule_appointment: 'Reschedule', check_availability: 'Availability', lookup_appointment: 'Lookup', walk_in_today: 'Walk-in' }

export default function Calls() {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      setLogs(data || [])
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('calls-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' }, ({ new: row }) => {
        setLogs(prev => [row, ...prev].slice(0, 200))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const filtered = logs.filter(l => {
    if (filter !== 'all' && l.outcome !== filter) return false
    const q = search.toLowerCase()
    return !q || l.caller_name?.toLowerCase().includes(q) || l.caller_phone?.includes(q) || l.intent?.toLowerCase().includes(q)
  })

  function exportCSV() {
    const headers = ['Date/Time', 'Name', 'Phone', 'Email', 'Intent', 'Outcome', 'Notes']
    const rows = filtered.map(l => [
      fmt(l.created_at), l.caller_name || '', l.caller_phone || '', l.caller_email || '',
      l.intent || '', l.outcome || '', l.notes || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`))
    const csv = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `call-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    })
    a.click(); URL.revokeObjectURL(a.href)
  }

  const counts = { all: logs.length, booked: 0, failed: 0 }
  logs.forEach(l => { if (l.outcome === 'booked') counts.booked++; if (l.outcome === 'failed') counts.failed++ })

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Calls</h1>
          <div className="topbar-sub">AI receptionist call history</div>
        </div>
      </div>

      <div className="page">
        <div className="stats-grid" style={{ marginBottom: 18 }}>
          <div className="stat-card">
            <div className="stat-label">Total Calls</div>
            <div className="stat-value">{logs.length}</div>
            <div className="stat-sub">last 200 shown</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Bookings Made</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{counts.booked}</div>
            <div className="stat-sub">{logs.length ? `${Math.round(counts.booked / logs.length * 100)}% conversion` : '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Failed Calls</div>
            <div className="stat-value" style={{ color: counts.failed ? 'var(--red)' : 'var(--gold)' }}>{counts.failed}</div>
            <div className="stat-sub">{counts.failed ? 'needs review' : 'all handled'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search name, phone, intent…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 280, maxWidth: '100%' }} />
          <div className="segment">
            {['all', 'booked', 'failed'].map(f => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}>↓ CSV</button>
        </div>

        {loading ? (
          <div className="empty-state"><div className="e-icon"><Icon name="loader" size={28} className="spin" /></div>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="e-icon"><Icon name="phone" size={30} /></div>No calls logged yet</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Caller</th>
                  <th className="hide-mobile">Phone</th>
                  <th>Intent</th>
                  <th>Outcome</th>
                  <th className="hide-mobile">Notes</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{l.caller_name || <span style={{ color: 'var(--text-dim)' }}>Unknown</span>}</td>
                    <td className="hide-mobile" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{l.caller_phone || '—'}</td>
                    <td style={{ fontSize: 13 }}>{INTENT_LABEL[l.intent] || l.intent || '—'}</td>
                    <td><span className={`badge ${OUTCOME_COLOR[l.outcome] || 'badge-gray'}`}>{l.outcome || 'logged'}</span></td>
                    <td className="hide-mobile" style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220 }}>{l.notes || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fmt(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '10px 4px', fontSize: 12, color: 'var(--text-dim)' }}>
              {filtered.length} call{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
