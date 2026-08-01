import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Icon from '../components/Icon'

const TZ = 'Europe/London'

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }) : '—'
const fmtDT   = d => d ? new Date(d).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

function mmss(sec) {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

// gold under 75%, amber to 90%, red beyond — the client should see trouble coming
function usageColour(pct) {
  if (pct >= 90) return 'var(--red)'
  if (pct >= 75) return 'var(--amber)'
  return 'var(--gold)'
}

function Meter({ used, limit }) {
  if (!limit) return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>unmetered</div>
  const pct = Math.min(100, Math.round((used / limit) * 100))
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 6, background: 'var(--surface2, rgba(255,255,255,.08))', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: usageColour(pct), borderRadius: 99, transition: 'width .3s' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{pct}% used</div>
    </div>
  )
}

export default function Usage({ isOperator }) {
  const [pkg,   setPkg]   = useState(null)
  const [calls, setCalls] = useState([])
  const [state, setState] = useState('loading')   // loading | ready | nopackage

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('usage_current_period').select('*').maybeSingle()
      if (!p) { setState('nopackage'); return }
      setPkg(p)

      const { data: c } = await supabase
        .from('call_logs')
        .select('id, started_at, duration_seconds, billable_minutes, handled_by, intent, outcome, booking_id, caller_name, caller_phone, recording_url')
        .gte('started_at', p.period_start)
        .order('started_at', { ascending: false })
        .limit(500)
      setCalls(c || [])
      setState('ready')
    }
    load()
  }, [])

  if (state === 'loading') {
    return (
      <>
        <div className="topbar"><div><h1>My Plan</h1><div className="topbar-sub">What you've used this month</div></div></div>
        {/* progressive-loading: skeletons in the real layout, so nothing shifts when data lands */}
        <div className="page" aria-busy="true" aria-label="Loading your plan">
          <div className="stats-grid">
            {[0, 1, 2, 3].map(i => (
              <div className="stat-card" key={i}>
                <div className="skeleton" style={{ height: 12, width: '55%', marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 28, width: '40%', marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 6, width: '100%' }} />
              </div>
            ))}
          </div>
          <div className="grid-2col" style={{ marginTop: 16 }}>
            <div className="card"><div className="skeleton" style={{ height: 132 }} /></div>
            <div className="card"><div className="skeleton" style={{ height: 132 }} /></div>
          </div>
        </div>
      </>
    )
  }

  if (state === 'nopackage') {
    return (
      <>
        <div className="topbar"><div><h1>My Plan</h1><div className="topbar-sub">What you've used this month</div></div></div>
        <div className="page">
          <div className="empty-state">
            <div className="e-icon"><Icon name="gauge" size={30} /></div>
            No plan set up yet.{' '}
            {isOperator ? 'Add one in Settings → Plan.' : 'Get in touch and we’ll sort it out.'}
          </div>
        </div>
      </>
    )
  }

  const minsPct   = pkg.included_minutes ? (pkg.minutes_used / pkg.included_minutes) * 100 : 0
  const callsPct  = pkg.included_calls   ? (pkg.calls_received / pkg.included_calls) * 100 : 0
  const worstPct  = Math.max(minsPct, callsPct)
  const aiPct     = pkg.calls_received ? Math.round((pkg.calls_ai_handled / pkg.calls_received) * 100) : 0
  const convPct   = pkg.calls_received ? Math.round((pkg.calls_with_booking / pkg.calls_received) * 100) : 0
  const overage   = Number(pkg.overage_minutes || 0)

  // minutes per day across the period
  const byDay = {}
  calls.forEach(c => {
    if (!c.started_at) return
    const k = new Date(c.started_at).toLocaleDateString('en-CA', { timeZone: TZ })
    byDay[k] = (byDay[k] || 0) + (c.billable_minutes || 0)
  })
  const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b))
  const peak = Math.max(1, ...days.map(([, v]) => v))
  const busiest = days.length ? days.reduce((a, b) => (b[1] > a[1] ? b : a)) : ['', 0]

  return (
    <>
      <div className="topbar">
        <div>
          <h1>My Plan</h1>
          <div className="topbar-sub">
            {pkg.plan_name} · {fmtDate(pkg.period_start)} – {fmtDate(pkg.period_end)}
          </div>
        </div>
      </div>

      <div className="page">

        {worstPct >= 90 && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--red)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Icon name="alert" size={16} style={{ color: 'var(--red)' }} />
              <strong>You've used {Math.round(worstPct)}% of this period's allowance.</strong>
              <span style={{ color: 'var(--text-muted)' }}>
                {pkg.minutes_left} minutes and {pkg.calls_left} calls remaining.
              </span>
            </div>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Minutes Used</div>
            <div className="stat-value" style={{ color: usageColour(minsPct) }}>
              {pkg.minutes_used}
              <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 400 }}>
                {pkg.included_minutes ? ` / ${pkg.included_minutes}` : ''}
              </span>
            </div>
            <div className="stat-sub">{pkg.included_minutes ? `${pkg.minutes_left} left` : 'unmetered'}</div>
            <Meter used={pkg.minutes_used} limit={pkg.included_minutes} />
          </div>

          <div className="stat-card">
            <div className="stat-label">Calls Received</div>
            <div className="stat-value" style={{ color: usageColour(callsPct) }}>
              {pkg.calls_received}
              <span style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 400 }}>
                {pkg.included_calls ? ` / ${pkg.included_calls}` : ''}
              </span>
            </div>
            <div className="stat-sub">{pkg.included_calls ? `${pkg.calls_left} left` : 'unmetered'}</div>
            <Meter used={pkg.calls_received} limit={pkg.included_calls} />
          </div>

          <div className="stat-card">
            <div className="stat-label">AI Handled</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{pkg.calls_ai_handled}</div>
            <div className="stat-sub">{pkg.calls_received ? `${aiPct}% of all calls` : 'no calls yet'}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Needed a Human</div>
            <div className="stat-value" style={{ color: (pkg.calls_transferred + pkg.calls_missed) ? 'var(--amber)' : 'var(--text)' }}>
              {pkg.calls_transferred + pkg.calls_missed}
            </div>
            <div className="stat-sub">{pkg.calls_transferred} transferred · {pkg.calls_missed} missed</div>
          </div>
        </div>

        {overage > 0 && (
          <div className="card" style={{ marginTop: 16, borderLeft: '3px solid var(--amber)' }}>
            <div style={{ fontSize: 13 }}>
              <strong>{overage} minutes over the included allowance.</strong>{' '}
              <span style={{ color: 'var(--text-muted)' }}>
                At £{Number(pkg.overage_per_minute).toFixed(2)}/min that's{' '}
                <strong style={{ color: 'var(--gold)' }}>£{(overage * Number(pkg.overage_per_minute)).toFixed(2)}</strong> this period.
              </span>
            </div>
          </div>
        )}

        <div className="grid-2col" style={{ marginTop: 16 }}>
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="activity" size={14} /> Minutes per Day
            </div>
            {days.length === 0 ? (
              <div className="empty-state"><div className="e-icon"><Icon name="phone" size={28} /></div>No calls this period yet</div>
            ) : (
              <>
                {/* screen-reader-summary: the takeaway, not just the raw marks */}
                <p className="sr-only">
                  Bar chart of call minutes per day from {fmtDate(days[0][0])} to {fmtDate(days[days.length - 1][0])}.
                  Busiest day was {fmtDate(busiest[0])} with {busiest[1]} minutes.
                  Total {pkg.minutes_used} minutes across {days.length} days.
                </p>

                <div className="chart">
                  {/* axis-labels: a scale you can read, not a floating shape */}
                  <div className="chart-axis" aria-hidden="true">
                    <span>{peak}m</span>
                    <span>{Math.round(peak / 2)}m</span>
                    <span>0</span>
                  </div>

                  <ul className="chart-bars">
                    {days.map(([d, v]) => (
                      <li key={d} className="chart-bar-slot">
                        {/* focusable + labelled: values reachable by keyboard, not hover-only */}
                        <button
                          type="button"
                          className="chart-bar"
                          style={{ height: `${Math.max((v / peak) * 100, 3)}%` }}
                          aria-label={`${fmtDate(d)}: ${v} minute${v === 1 ? '' : 's'}`}
                          title={`${fmtDate(d)} — ${v} min`}
                        >
                          <span className="chart-tip" aria-hidden="true">{v}m</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="chart-foot" aria-hidden="true">
                  <span>{fmtDate(days[0][0])}</span>
                  <span>{fmtDate(days[days.length - 1][0])}</span>
                </div>

                {/* data-table: the accessible equivalent, collapsed so it doesn't add noise */}
                <details className="chart-data">
                  <summary>View as a table</summary>
                  <div className="table-wrap" style={{ marginTop: 'var(--sp-3)' }}>
                    <table>
                      <caption className="sr-only">Call minutes per day</caption>
                      <thead><tr><th scope="col">Day</th><th scope="col">Minutes</th></tr></thead>
                      <tbody>
                        {days.map(([d, v]) => (
                          <tr key={d}><td>{fmtDate(d)}</td><td>{v}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </div>

          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="clock" size={14} /> Call Quality
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Line label="Average length"   value={mmss(pkg.avg_seconds)} />
              <Line label="Longest call"     value={mmss(pkg.longest_seconds)} />
              <Line label="Led to a booking" value={`${pkg.calls_with_booking}${pkg.calls_received ? ` (${convPct}%)` : ''}`} />
              <div className="divider" />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Calls are billed per call, rounded up to the next whole minute (minimum one minute).
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="phone" size={14} /> Recent Calls
          </div>
          {calls.length === 0 ? (
            <div className="empty-state">
              <div className="e-icon"><Icon name="phone" size={28} /></div>
              No calls yet. Once the phone assistant starts taking calls they'll show up here.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th className="hide-mobile">Caller</th>
                    <th>Length</th>
                    <th>Billed</th>
                    <th>Handled By</th>
                    <th className="hide-mobile">Booking</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.slice(0, 50).map(c => (
                    <tr key={c.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fmtDT(c.started_at)}</td>
                      <td className="hide-mobile" style={{ fontSize: 13 }}>{c.caller_name || c.caller_phone || '—'}</td>
                      <td style={{ fontSize: 13 }}>{mmss(c.duration_seconds)}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{c.billable_minutes} min</td>
                      <td>
                        <span className={`badge ${c.handled_by === 'ai' ? 'badge-green' : c.handled_by === 'missed' ? 'badge-red' : 'badge-gold'}`}>
                          {c.handled_by}
                        </span>
                      </td>
                      <td className="hide-mobile" style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--gold)' }}>
                        {c.booking_id || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Line({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )
}
