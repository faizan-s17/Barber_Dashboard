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

const STATUS_BORDER = { confirmed: 'var(--gold)', rescheduled: '#60a5fa', cancelled: '#f87171' }

export default function Overview({ profile }) {
  const [services,    setServices]    = useState([])
  const [barbers,     setBarbers]     = useState([])
  const [shop,        setShop]        = useState(null)
  const [todayAppts,  setTodayAppts]  = useState(null)
  const [weekRevenue, setWeekRevenue] = useState(null)

  useEffect(() => {
    const { start: todayStart, end: todayEnd } = getLondonTodayBounds()
    const { start: weekStart,  end: weekEnd  } = getLondonWeekBounds()

    Promise.all([
      supabase.from('services').select('*').eq('active', true),
      supabase.from('barbers').select('*').eq('active', true),
      supabase.from('shop_config').select('*').single(),
      supabase.from('appointments').select('*')
        .gte('start_time', todayStart).lte('start_time', todayEnd)
        .order('start_time'),
      supabase.from('appointments').select('service_price')
        .gte('start_time', weekStart).lte('start_time', weekEnd)
        .eq('status', 'confirmed'),
    ]).then(([svc, brb, sh, today, week]) => {
      setServices(svc.data || [])
      setBarbers(brb.data || [])
      setShop(sh.data)
      setTodayAppts(today.data || [])
      const rev = (week.data || []).reduce((s, a) => s + parsePrice(a.service_price), 0)
      setWeekRevenue(rev)
    })
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const todayConfirmed = (todayAppts || []).filter(a => a.status !== 'cancelled')
  const todayRevenue   = todayConfirmed.reduce((s, a) => s + parsePrice(a.service_price), 0)

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Overview</h1>
          <div className="topbar-sub">{greeting}, {profile?.name}</div>
        </div>
      </div>
      <div className="page">

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Active Services</div>
            <div className="stat-value">{services.length}</div>
            <div className="stat-sub">on the menu</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Barbers</div>
            <div className="stat-value">{barbers.length}</div>
            <div className="stat-sub">staff members</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Today's Bookings</div>
            <div className="stat-value">{todayAppts === null ? '…' : todayConfirmed.length}</div>
            <div className="stat-sub">
              {todayAppts !== null && todayRevenue > 0
                ? `≈ £${todayRevenue} expected`
                : 'no confirmed bookings'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Week Revenue</div>
            <div className="stat-value" style={{ fontSize: 22 }}>
              {weekRevenue === null ? '…' : `£${weekRevenue}`}
            </div>
            <div className="stat-sub">confirmed this week</div>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="calendar" size={14} /> Today's Schedule</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>

          {todayAppts === null ? (
            <div className="empty-state"><div className="e-icon"><Icon name="loader" size={28} className="spin" /></div>Loading…</div>
          ) : todayAppts.length === 0 ? (
            <div className="empty-state"><div className="e-icon"><Icon name="clipboard" size={28} /></div>No appointments today</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todayAppts.map(a => (
                <div key={a.id} style={{
                  display: 'grid', gridTemplateColumns: '52px 1fr auto auto',
                  gap: 10, alignItems: 'center', padding: '8px 10px',
                  background: 'var(--surface2)', borderRadius: 6,
                  borderLeft: `3px solid ${STATUS_BORDER[a.status] || '#555'}`
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {fmtTime(a.start_time)}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.customer_name || 'Unknown'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.service_name}</div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.barber_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>{a.service_price}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                {todayConfirmed.length} confirmed
                {todayRevenue > 0 && (
                  <span style={{ color: 'var(--gold)', marginLeft: 4, fontWeight: 600 }}>
                    · ≈ £{todayRevenue} total
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Shop Info + Barbers */}
        <div className="grid-2col" style={{ marginTop: 0 }}>
          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="pin" size={14} /> Shop Info</div>
            {shop ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <InfoLine label="Name"    value={shop.name} />
                <InfoLine label="Address" value={shop.address} />
                <InfoLine label="Phone"   value={shop.phone} />
                <InfoLine label="Email"   value={shop.shop_email} />
              </div>
            ) : <div className="empty-state"><div className="e-icon"><Icon name="loader" size={28} className="spin" /></div>Loading…</div>}
          </div>

          <div className="card">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="scissors" size={14} /> Active Barbers</div>
            {barbers.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {barbers.map(b => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, background: 'var(--gold)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#111', flexShrink: 0 }}>
                      {b.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{b.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.email}</div>
                    </div>
                    <span className={`badge ${b.role === 'admin' ? 'badge-gold' : 'badge-gray'}`} style={{ marginLeft: 'auto' }}>{b.role}</span>
                  </div>
                ))}
              </div>
            ) : <div className="empty-state"><div className="e-icon"><Icon name="user" size={28} /></div>No barbers yet</div>}
          </div>
        </div>

        {/* Services Menu */}
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="tag" size={14} /> Services Menu</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {services.map(s => (
              <div key={s.id} style={{ padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>{s.name}</span>
                <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>{s.price}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function InfoLine({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value || '—'}</span>
    </div>
  )
}
