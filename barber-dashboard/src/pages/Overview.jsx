import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Icon from '../components/Icon'

const TZ = 'Europe/London'

function getLondonOffsetStr() {
  const now = new Date()
  const londonMs = new Date(now.toLocaleString('en-US', { timeZone: TZ })).getTime()
  const utcMs    = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  const mins = Math.round((londonMs - utcMs) / 60000)
  const sign = mins >= 0 ? '+' : '-'
  const h = String(Math.floor(Math.abs(mins) / 60)).padStart(2, '0')
  const m = String(Math.abs(mins) % 60).padStart(2, '0')
  return `${sign}${h}:${m}`
}

function getLondonTodayBounds() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const ofs = getLondonOffsetStr()
  return { start: `${today}T00:00:00${ofs}`, end: `${today}T23:59:59${ofs}` }
}

function getTomorrowBounds() {
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m, d] = todayStr.split('-').map(Number)
  const tmrw = new Date(y, m - 1, d + 1)
  const fmt = `${tmrw.getFullYear()}-${String(tmrw.getMonth()+1).padStart(2,'0')}-${String(tmrw.getDate()).padStart(2,'0')}`
  const ofs = getLondonOffsetStr()
  return { start: `${fmt}T00:00:00${ofs}`, end: `${fmt}T23:59:59${ofs}` }
}

function getLondonWeekBounds() {
  const now    = new Date()
  const today  = now.toLocaleDateString('en-CA', { timeZone: TZ })
  const dowStr = now.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const dow    = dowMap[dowStr] ?? 1
  const toMon  = dow === 0 ? 6 : dow - 1
  const [y, m, d] = today.split('-').map(Number)
  const mon = new Date(y, m - 1, d - toMon)
  const sun = new Date(y, m - 1, d - toMon + 6)
  const fmt = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
  const ofs = getLondonOffsetStr()
  return { start: `${fmt(mon)}T00:00:00${ofs}`, end: `${fmt(sun)}T23:59:59${ofs}` }
}

function parsePrice(str) {
  if (!str) return 0
  const n = parseFloat(str.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

function fmtTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

function timeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function pad(n) { return String(n).padStart(2, '0') }

const CALL_RESULT = {
  missed: { label: 'Missed', cls: 'badge-red' },
  transferred: { label: 'Passed to you', cls: 'badge-amber' },
  voicemail: { label: 'Left a message', cls: 'badge-gray' },
}
const CALL_OUTCOME = {
  booked: { label: 'Booked in', cls: 'badge-green' },
  cancelled: { label: 'Cancelled', cls: 'badge-red' },
  rescheduled: { label: 'Moved', cls: 'badge-blue' },
  failed: { label: "Didn't finish", cls: 'badge-red' },
}
function callResult(c) {
  return CALL_RESULT[c.handled_by] || CALL_OUTCOME[c.outcome] || { label: 'Answered', cls: 'badge-gray' }
}

function RingChart({ value, color, bg = 'var(--surface3)' }) {
  const r = 40, c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c
  return (
    <svg viewBox="0 0 100 100" className="ring-svg">
      <circle cx="50" cy="50" r={r} fill="none" stroke={bg} strokeWidth="8" />
      {value > 0 && (
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      )}
    </svg>
  )
}

export default function Overview({ profile }) {
  const [barbers,     setBarbers]     = useState([])
  const [todayAppts,  setTodayAppts]  = useState(null)
  const [weekAppts,   setWeekAppts]   = useState(null)
  const [recentCalls, setRecentCalls] = useState(null)
  const [tmrwAppts,   setTmrwAppts]   = useState(null)

  useEffect(() => {
    const { start: todayStart, end: todayEnd } = getLondonTodayBounds()
    const { start: weekStart,  end: weekEnd  } = getLondonWeekBounds()
    const { start: tmrwStart,  end: tmrwEnd  } = getTomorrowBounds()

    Promise.all([
      supabase.from('barbers').select('*').eq('active', true).neq('role', 'operator'),
      supabase.from('appointments').select('*')
        .gte('start_time', todayStart).lte('start_time', todayEnd)
        .order('start_time'),
      supabase.from('appointments').select('service_price, status, barber_name')
        .gte('start_time', weekStart).lte('start_time', weekEnd),
      supabase.from('call_logs').select('id, caller_name, caller_phone, handled_by, outcome, created_at')
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('appointments').select('id, start_time, customer_name, service_name, barber_name, status')
        .gte('start_time', tmrwStart).lte('start_time', tmrwEnd)
        .neq('status', 'cancelled')
        .order('start_time'),
    ]).then(([brb, today, week, calls, tmrw]) => {
      setBarbers(brb.data || [])
      setTodayAppts(today.data || [])
      setWeekAppts(week.data || [])
      setRecentCalls(calls.data || [])
      setTmrwAppts(tmrw.data || [])
    })
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
  const tmrwLabel = new Date(Date.now() + 86400000).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long' })

  const allToday      = todayAppts || []
  const confirmedList = allToday.filter(a => a.status === 'confirmed')
  const pendingList   = allToday.filter(a => a.status !== 'confirmed' && a.status !== 'cancelled')
  const cancelledList = allToday.filter(a => a.status === 'cancelled')
  const activeToday   = allToday.filter(a => a.status !== 'cancelled')

  const todayRevenue  = activeToday.reduce((s, a) => s + parsePrice(a.service_price), 0)
  const weekConfirmed = (weekAppts || []).filter(a => a.status !== 'cancelled')
  const weekRevenue   = weekConfirmed.reduce((s, a) => s + parsePrice(a.service_price), 0)

  const totalToday   = allToday.length
  const confirmedPct = totalToday > 0 ? Math.round((confirmedList.length / totalToday) * 100) : 0
  const cancelledPct = totalToday > 0 ? Math.round((cancelledList.length / totalToday) * 100) : 0
  const revenuePct   = Math.min(95, (weekRevenue / Math.max(1, weekRevenue + 200)) * 100)

  const barberRevenue = {}
  for (const a of weekConfirmed) {
    if (a.barber_name) barberRevenue[a.barber_name] = (barberRevenue[a.barber_name] || 0) + parsePrice(a.service_price)
  }
  const topBarberRev = Math.max(1, ...Object.values(barberRevenue))

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{greeting}, {profile?.name?.split(' ')[0]}</h1>
          <div className="topbar-sub">{today}</div>
        </div>
      </div>

      <div className="page">
        <div className="dash-grid">
          {/* ── Left: main content ── */}
          <div className="dash-main">
            {/* Status summary cards */}
            <div className="status-row">
              <div className="status-card">
                <div className="status-card-icon status-icon-green">
                  <Icon name="check" size={20} />
                </div>
                <div>
                  <div className="status-card-label">Confirmed</div>
                  <div className="status-card-count">{todayAppts === null ? '—' : pad(confirmedList.length)}</div>
                </div>
              </div>
              <div className="status-card">
                <div className="status-card-icon status-icon-amber">
                  <Icon name="clock" size={20} />
                </div>
                <div>
                  <div className="status-card-label">Pending</div>
                  <div className="status-card-count">{todayAppts === null ? '—' : pad(pendingList.length)}</div>
                </div>
              </div>
              <div className="status-card">
                <div className="status-card-icon status-icon-red">
                  <Icon name="xMark" size={20} />
                </div>
                <div>
                  <div className="status-card-label">Cancelled</div>
                  <div className="status-card-count">{todayAppts === null ? '—' : pad(cancelledList.length)}</div>
                </div>
              </div>
            </div>

            {/* Reservation table */}
            <div className="card">
              <div className="reservation-head">
                <span className="reservation-title">Reservation</span>
                <span className="reservation-badge">{activeToday.length} today</span>
              </div>

              {todayAppts === null ? (
                <div className="empty-state" style={{ padding: 'var(--sp-8) var(--sp-4)' }}>
                  <div className="e-icon"><Icon name="loader" size={28} className="spin" /></div>Loading…
                </div>
              ) : allToday.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--sp-8) var(--sp-4)' }}>
                  <div className="e-icon"><Icon name="clipboard" size={28} /></div>
                  No bookings today — enjoy the quiet
                </div>
              ) : (
                <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col" style={{ width: 44 }}>#</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Time</th>
                        <th scope="col" className="hide-mobile">Service</th>
                        <th scope="col">Status</th>
                        <th scope="col">Barber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allToday.map((a, i) => {
                        const st = a.status === 'confirmed'
                          ? { label: 'Confirm', color: 'var(--green)' }
                          : a.status === 'cancelled'
                          ? { label: 'Cancelled', color: 'var(--red)' }
                          : { label: 'Pending', color: 'var(--amber)' }
                        return (
                          <tr key={a.id} style={a.status === 'cancelled' ? { opacity: 0.5 } : undefined}>
                            <td><span className="row-num">{i + 1}</span></td>
                            <td style={{ fontWeight: 600 }}>{a.customer_name || 'Walk-in'}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(a.start_time)}</td>
                            <td className="hide-mobile" style={{ color: 'var(--text-muted)' }}>{a.service_name || '—'}</td>
                            <td><span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span></td>
                            <td>{a.barber_name || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Bottom row: Revenue + Recent Calls */}
            <div className="dash-bottom-row">
              <div className="card">
                <div className="card-title"><Icon name="activity" size={14} /> Revenue by Barber</div>
                {barbers.length === 0 ? (
                  <div className="empty-state" style={{ padding: 'var(--sp-6) 0' }}>
                    <div className="e-icon"><Icon name="loader" size={24} className="spin" /></div>Loading…
                  </div>
                ) : (
                  <div className="rev-bars">
                    {barbers.map(b => {
                      const rev = barberRevenue[b.name] || 0
                      const pct = topBarberRev > 0 ? (rev / topBarberRev) * 100 : 0
                      return (
                        <div key={b.id} className="rev-bar-row">
                          <div className="rev-bar-head">
                            <div className="avatar-chip" style={{ width: 26, height: 26, fontSize: 'var(--fs-2xs)' }}>{b.name.charAt(0)}</div>
                            <span className="rev-bar-name">{b.name}</span>
                            <span className="rev-bar-amount">£{rev}</span>
                          </div>
                          <div className="meter"><div className="meter-fill" style={{ width: `${pct}%` }} /></div>
                        </div>
                      )
                    })}
                    <div className="rev-total">
                      <span>Week total</span>
                      <strong>£{weekRevenue}</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-title"><Icon name="phone" size={14} /> Recent Calls</div>
                {recentCalls === null ? (
                  <div className="empty-state" style={{ padding: 'var(--sp-6) var(--sp-4)' }}>
                    <div className="e-icon"><Icon name="loader" size={24} className="spin" /></div>Loading…
                  </div>
                ) : recentCalls.length === 0 ? (
                  <div className="empty-state" style={{ padding: 'var(--sp-6) var(--sp-4)' }}>
                    <div className="e-icon"><Icon name="phone" size={24} /></div>No calls yet
                  </div>
                ) : (
                  <div className="activity-list">
                    {recentCalls.map(c => {
                      const r = callResult(c)
                      return (
                        <div key={c.id} className="activity-row">
                          <div className="activity-icon"><Icon name="phone" size={14} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="activity-who">{c.caller_name || c.caller_phone || 'Unknown'}</div>
                            <div className="activity-meta">{timeAgo(c.created_at)}</div>
                          </div>
                          <span className={`badge ${r.cls}`}>{r.label}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div className="dash-sidebar">
            {/* Ring stat: Weekly Revenue */}
            <div className="card ring-stat-card">
              <div className="ring-stat-info">
                <div className="ring-stat-title">Weekly Revenue</div>
                <div className="ring-stat-legend">
                  <span><i className="ring-dot" style={{ background: 'var(--gold)' }} /> Revenue</span>
                  <span><i className="ring-dot" style={{ background: 'var(--surface3)' }} /> Remaining</span>
                </div>
              </div>
              <div className="ring-stat-ring">
                <RingChart value={revenuePct} color="var(--gold)" />
                <div className="ring-stat-value">£{weekRevenue}</div>
              </div>
            </div>

            {/* Ring stat: Today's Bookings */}
            <div className="card ring-stat-card">
              <div className="ring-stat-info">
                <div className="ring-stat-title">Today's Bookings</div>
                <div className="ring-stat-legend">
                  <span><i className="ring-dot" style={{ background: 'var(--green)' }} /> {confirmedPct}% Confirmed</span>
                  <span><i className="ring-dot" style={{ background: 'var(--red)' }} /> {cancelledPct}% Cancelled</span>
                </div>
              </div>
              <div className="ring-stat-ring">
                <RingChart value={totalToday > 0 ? confirmedPct : 0} color="var(--green)" />
                <div className="ring-stat-value">{todayAppts === null ? '—' : totalToday}</div>
              </div>
            </div>

            {/* Who's Working */}
            <div className="card">
              <div className="card-title"><Icon name="scissors" size={14} /> Who's Working</div>
              {barbers.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--sp-6) 0' }}>
                  <div className="e-icon"><Icon name="loader" size={24} className="spin" /></div>Loading…
                </div>
              ) : (
                <div className="team-list">
                  {barbers.map(b => {
                    const todayCount = activeToday.filter(a => a.barber_name === b.name).length
                    return (
                      <div key={b.id} className="team-row">
                        <div className="avatar-chip" style={{ width: 30, height: 30, fontSize: 'var(--fs-xs)' }}>{b.name.charAt(0)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="team-name">{b.name}</div>
                          <div className="team-meta">{todayCount} booking{todayCount !== 1 ? 's' : ''} today</div>
                        </div>
                        <span className="badge badge-green" style={{ flexShrink: 0 }}>On</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Tomorrow preview */}
            <div className="card">
              <div className="card-title"><Icon name="calendar" size={14} /> Tomorrow — {tmrwLabel}</div>
              {tmrwAppts === null ? (
                <div className="empty-state" style={{ padding: 'var(--sp-6) var(--sp-4)' }}>
                  <div className="e-icon"><Icon name="loader" size={24} className="spin" /></div>Loading…
                </div>
              ) : tmrwAppts.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--sp-6) var(--sp-4)' }}>
                  <div className="e-icon"><Icon name="calendar" size={24} /></div>Nothing booked yet
                </div>
              ) : (
                <div className="schedule-list">
                  {tmrwAppts.slice(0, 5).map(a => (
                    <div key={a.id} className="schedule-row">
                      <span className="schedule-time">{fmtTime(a.start_time)}</span>
                      <div className="schedule-who">
                        <div className="schedule-name">{a.customer_name || 'Walk-in'}</div>
                        <div className="schedule-service">{a.service_name} · {a.barber_name}</div>
                      </div>
                    </div>
                  ))}
                  {tmrwAppts.length > 5 && (
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: 'var(--sp-2) var(--sp-3)' }}>
                      +{tmrwAppts.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
