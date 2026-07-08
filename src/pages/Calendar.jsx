import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'

const HOUR_START = 9   // 9am
const HOUR_END   = 19  // 7pm
const TOTAL_MINS = (HOUR_END - HOUR_START) * 60

const STATUS_COLORS = {
  confirmed:   { bg: '#c9a96e22', border: '#c9a96e', text: '#c9a96e' },
  rescheduled: { bg: '#3b82f622', border: '#3b82f6', text: '#60a5fa' },
  cancelled:   { bg: '#ef444422', border: '#ef4444', text: '#f87171' }
}

const DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_F = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TZ     = 'Europe/London'

// All date/time helpers use London timezone
function londonParts(isoStr) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false
  })
  const parts = fmt.formatToParts(new Date(isoStr))
  const get = type => parts.find(p => p.type === type)?.value
  return {
    year: parseInt(get('year')), month: parseInt(get('month')),
    day: parseInt(get('day')),   hour: parseInt(get('hour')),
    minute: parseInt(get('minute')), weekday: get('weekday')
  }
}

function getWeekStart(date) {
  // Work in London date to find Monday
  const p = londonParts(date.toISOString())
  const weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  const offset = weekdayMap[p.weekday] ?? 0
  const d = new Date(date)
  d.setDate(d.getDate() - offset)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function pad2(n) { return String(n).padStart(2, '0') }
function firstOfMonth(date) { const d = new Date(date); d.setDate(1); d.setHours(0, 0, 0, 0); return d }

function fmt(date) {
  return date.toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' })
}

function fmtFull(date) {
  return date.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
}

function timeLabel(h) {
  const suffix = h >= 12 ? 'pm' : 'am'
  const display = h > 12 ? h - 12 : h
  return `${display}${suffix}`
}

function fmtTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

function minsFromDayStart(isoStr) {
  const { hour, minute } = londonParts(isoStr)
  return hour * 60 + minute - HOUR_START * 60
}

function dayIndex(isoStr) {
  const weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  return weekdayMap[londonParts(isoStr).weekday] ?? 0
}

function isSameDay(iso, refDate) {
  const a = londonParts(iso)
  const b = londonParts(refDate.toISOString())
  return a.year === b.year && a.month === b.month && a.day === b.day
}

// Convert a London-timezone date+time to a UTC ISO string
function londonToISO(dateStr, timeStr) {
  const fakeUTC = new Date(`${dateStr}T${timeStr}:00.000Z`)
  const londonMs = new Date(fakeUTC.toLocaleString('en-US', { timeZone: TZ })).getTime()
  const utcMs    = new Date(fakeUTC.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
  return new Date(fakeUTC.getTime() - (londonMs - utcMs)).toISOString()
}

function todayLondon() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}

export default function Calendar({ profile }) {
  const [barbers,     setBarbers]     = useState([])
  const [services,    setServices]    = useState([])
  const [selected,    setSelected]    = useState('all')
  const [weekStart,   setWeekStart]   = useState(() => getWeekStart(new Date()))
  const [appts,       setAppts]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [detail,      setDetail]      = useState(null)
  const [view,        setView]        = useState('week') // 'week' | 'day' | 'month'
  const [selectedDay, setSelectedDay] = useState(0)
  const [monthCursor, setMonthCursor] = useState(() => firstOfMonth(new Date()))
  const [monthSelDay, setMonthSelDay] = useState(null)
  const [showNew,     setShowNew]     = useState(false)

  // Load barbers + services once
  useEffect(() => {
    supabase.from('barbers').select('name').eq('active', true).then(({ data }) => {
      const names = (data || []).map(b => b.name)
      setBarbers(names)
      if (profile?.role !== 'admin' && profile?.name) setSelected(profile.name)
    })
    supabase.from('services').select('name,price,duration').eq('active', true).then(({ data }) => {
      setServices(data || [])
    })
  }, [profile])

  const load = useCallback(async () => {
    setLoading(true)
    let start, end
    if (view === 'month') {
      const y = monthCursor.getFullYear(), m = monthCursor.getMonth()
      const ny = m === 11 ? y + 1 : y, nm = m === 11 ? 0 : m + 1
      start = londonToISO(`${y}-${pad2(m + 1)}-01`, '00:00')
      end   = londonToISO(`${ny}-${pad2(nm + 1)}-01`, '00:00')
    } else {
      start = weekStart.toISOString()
      end   = addDays(weekStart, 7).toISOString()
    }
    let q = supabase.from('appointments')
      .select('*')
      .gte('start_time', start)
      .lt('start_time',  end)
      .order('start_time')

    if (selected !== 'all') q = q.eq('barber_name', selected)

    const { data } = await q
    setAppts(data || [])
    setLoading(false)
  }, [view, weekStart, monthCursor, selected])

  useEffect(() => { load() }, [load])

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today    = new Date()

  // Group appointments by day index in the current week
  const apptsByDay = Array.from({ length: 7 }, () => [])
  appts.forEach(a => {
    const d = dayIndex(a.start_time)
    if (d >= 0 && d < 7) apptsByDay[d].push(a)
  })

  const isMonth = view === 'month'
  const apptsByDate = {}
  if (isMonth) appts.forEach(a => { const day = londonParts(a.start_time).day; (apptsByDate[day] = apptsByDate[day] || []).push(a) })

  function prev() { if (isMonth) setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); else setWeekStart(d => addDays(d, -7)) }
  function next() { if (isMonth) setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); else setWeekStart(d => addDays(d, 7)) }
  function goToday() {
    const now = new Date()
    if (isMonth) { setMonthCursor(firstOfMonth(now)); setMonthSelDay(null) }
    else { setWeekStart(getWeekStart(now)); setSelectedDay(now.getDay() === 0 ? 6 : now.getDay() - 1) }
  }

  const confirmedCount  = appts.filter(a => a.status === 'confirmed').length
  const cancelledCount  = appts.filter(a => a.status === 'cancelled').length

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Calendar</h1>
          <div className="topbar-sub">
            {isMonth ? `${MONTHS[monthCursor.getMonth()]} ${monthCursor.getFullYear()}` : `${fmt(weekStart)} – ${fmt(addDays(weekStart, 6))}`} &nbsp;·&nbsp;
            <span style={{ color: 'var(--gold)' }}>{confirmedCount} confirmed</span>
            {cancelledCount > 0 && <span style={{ color: 'var(--text-dim)' }}>, {cancelledCount} cancelled</span>}
          </div>
        </div>
      </div>

      <div className="page" style={{ paddingBottom: 40 }}>
        {/* Controls bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={prev}>← Prev</button>
          <button className="btn btn-ghost btn-sm" onClick={goToday}>Today</button>
          <button className="btn btn-ghost btn-sm" onClick={next}>Next →</button>

          <div style={{ flex: 1 }} />

          <button className="btn btn-gold btn-sm" onClick={() => setShowNew(true)}>+ New Booking</button>

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 6, padding: 2, gap: 2 }}>
            {['week', 'day', 'month'].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all .15s',
                  background: view === v ? 'var(--gold)' : 'transparent',
                  color: view === v ? '#111' : 'var(--text-muted)' }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Barber filter */}
          <select value={selected} onChange={e => setSelected(e.target.value)}
            style={{ padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}>
            <option value="all">All Barbers</option>
            {barbers.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Day selector (day view) */}
        {view === 'day' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
            {weekDays.map((d, i) => {
              const isToday = isSameDay(d.toISOString(), today)
              const isSelected = i === selectedDay
              const count = apptsByDay[i].filter(a => a.status !== 'cancelled').length
              return (
                <button key={i} onClick={() => setSelectedDay(i)}
                  style={{ flex: '1 0 60px', padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, transition: 'all .15s',
                    background: isSelected ? 'var(--gold)' : isToday ? 'var(--surface3)' : 'var(--surface2)',
                    color: isSelected ? '#111' : isToday ? 'var(--text)' : 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{DAYS[i]}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>{d.getDate()}</div>
                  {count > 0 && <div style={{ marginTop: 3, width: 6, height: 6, borderRadius: '50%', background: isSelected ? '#111' : 'var(--gold)', margin: '4px auto 0' }} />}
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <div className="empty-state"><div className="e-icon">⏳</div>Loading…</div>
        ) : view === 'week' ? (
          <WeekGrid weekDays={weekDays} apptsByDay={apptsByDay} today={today} onSelect={setDetail} />
        ) : view === 'day' ? (
          <DayList appts={apptsByDay[selectedDay]} day={weekDays[selectedDay]} onSelect={setDetail} />
        ) : (
          <MonthGrid monthCursor={monthCursor} apptsByDate={apptsByDate} today={today}
            selectedDay={monthSelDay} onSelectDay={setMonthSelDay} onSelect={setDetail} onPrev={prev} onNext={next} />
        )}
      </div>

      {/* New Booking modal */}
      {showNew && (
        <NewBookingModal
          barbers={barbers}
          services={services}
          defaultBarber={selected !== 'all' ? selected : barbers[0] || ''}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load() }}
        />
      )}

      {/* Appointment detail modal */}
      {detail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16 }}>Appointment Details</h2>
              <button className="modal-close" onClick={() => setDetail(null)}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', padding: '2px 8px', borderRadius: 4,
                  background: STATUS_COLORS[detail.status]?.bg, color: STATUS_COLORS[detail.status]?.text,
                  border: `1px solid ${STATUS_COLORS[detail.status]?.border}` }}>
                  {detail.status}
                </span>
              </div>
              {[
                ['Customer', detail.customer_name],
                ['Phone',    detail.customer_phone],
                ['Email',    detail.customer_email],
                ['Service',  detail.service_name + (detail.service_price ? ' · ' + detail.service_price : '')],
                ['Barber',   detail.barber_name],
                ['Date',     new Date(detail.start_time).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })],
                ['Time',     fmtTime(detail.start_time) + ' – ' + fmtTime(detail.end_time) + ' (London)'],
                ['Notes',    detail.notes || '—'],
              ].map(([label, val]) => val && (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', paddingTop: 1 }}>{label}</span>
                  <span style={{ color: 'var(--text)' }}>{val}</span>
                </div>
              ))}
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

// ─── New Booking Modal ────────────────────────────────────────────────────────
function NewBookingModal({ barbers, services, defaultBarber, onClose, onSaved }) {
  const [form, setForm] = useState({
    customer_name:  '',
    customer_phone: '',
    customer_email: '',
    service_name:   services[0]?.name  || '',
    service_price:  services[0]?.price || '',
    barber_name:    defaultBarber,
    date:           todayLondon(),
    time:           '10:00',
    duration:       services[0]?.duration || 30,
    notes:          '',
  })
  const [saving, setSaving] = useState(false)

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      // Auto-fill price + duration when service changes
      if (key === 'service_name') {
        const svc = services.find(s => s.name === val)
        if (svc) { next.service_price = svc.price || ''; next.duration = svc.duration || 30 }
      }
      return next
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.customer_name.trim()) return toast.error('Customer name is required')
    if (!form.barber_name)          return toast.error('Please select a barber')
    if (!form.service_name)         return toast.error('Please select a service')

    setSaving(true)
    const startISO = londonToISO(form.date, form.time)
    const endISO   = new Date(new Date(startISO).getTime() + Number(form.duration) * 60000).toISOString()

    const { error } = await supabase.from('appointments').insert({
      customer_name:  form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      customer_email: form.customer_email.trim() || null,
      service_name:   form.service_name,
      service_price:  form.service_price || null,
      barber_name:    form.barber_name,
      start_time:     startISO,
      end_time:       endISO,
      status:         'confirmed',
      notes:          form.notes.trim() || null,
    })

    setSaving(false)
    if (error) { toast.error('Failed to save: ' + error.message); return }
    toast.success('Booking added!')
    onSaved()
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: 'var(--surface2)',
    border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)',
    fontSize: 13, boxSizing: 'border-box'
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, width: '95vw' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16 }}>New Booking</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSave}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 8px' }}>

            {/* Customer */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: -6 }}>Customer</div>
            <input style={inputStyle} placeholder="Full name *" value={form.customer_name}
              onChange={e => set('customer_name', e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input style={inputStyle} placeholder="Phone" type="tel" value={form.customer_phone}
                onChange={e => set('customer_phone', e.target.value)} />
              <input style={inputStyle} placeholder="Email" type="email" value={form.customer_email}
                onChange={e => set('customer_email', e.target.value)} />
            </div>

            {/* Service + Barber */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: -6 }}>Appointment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select style={inputStyle} value={form.service_name} onChange={e => set('service_name', e.target.value)}>
                <option value="">— Service —</option>
                {services.map(s => <option key={s.name} value={s.name}>{s.name} {s.price ? `(${s.price})` : ''}</option>)}
              </select>
              <select style={inputStyle} value={form.barber_name} onChange={e => set('barber_name', e.target.value)}>
                <option value="">— Barber —</option>
                {barbers.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            {/* Date + Time + Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Date (London)</div>
                <input style={inputStyle} type="date" value={form.date}
                  onChange={e => set('date', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Time (London)</div>
                <input style={inputStyle} type="time" value={form.time} min="09:00" max="19:00" step="900"
                  onChange={e => set('time', e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Mins</div>
                <input style={inputStyle} type="number" value={form.duration} min="15" max="180" step="15"
                  onChange={e => set('duration', e.target.value)} />
              </div>
            </div>

            {/* Notes */}
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              placeholder="Notes (optional)" value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? 'Saving…' : 'Save Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Month Grid ───────────────────────────────────────────────────────────────
function MonthGrid({ monthCursor, apptsByDate, today, selectedDay, onSelectDay, onSelect, onPrev, onNext }) {
  const y = monthCursor.getFullYear(), m = monthCursor.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7 // Mon = 0
  const tp = londonParts(today.toISOString())
  const isCurrentMonth = tp.year === y && tp.month === m + 1

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const Chevron = ({ dir }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{MONTHS[m]} {y}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onPrev} aria-label="Previous month"><Chevron dir="left" /></button>
          <button className="btn btn-ghost btn-sm" onClick={onNext} aria-label="Next month"><Chevron dir="right" /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }}>
        {DAYS.map(d => <div key={d} style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, paddingLeft: 4 }}>{d}</div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const isToday = isCurrentMonth && tp.day === d
          const isSelected = selectedDay === d
          const list = (apptsByDate[d] || []).filter(a => a.status !== 'cancelled')
          return (
            <div key={i} onClick={() => onSelectDay(isSelected ? null : d)}
              style={{
                minHeight: 104, background: 'var(--surface2)', borderRadius: 10,
                border: isSelected ? '1.5px solid var(--gold)' : '1px solid var(--border)',
                padding: '8px 9px', cursor: 'pointer', overflow: 'hidden', transition: 'border-color .15s'
              }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 22, height: 22, borderRadius: 6, padding: '0 5px', fontSize: 13, fontWeight: 700,
                background: isToday ? 'var(--gold)' : 'transparent',
                color: isToday ? '#111' : 'var(--text-muted)'
              }}>{d}</div>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {list.slice(0, 3).map(a => (
                  <div key={a.id} onClick={(e) => { e.stopPropagation(); onSelect(a) }}
                    title={`${fmtTime(a.start_time)} ${a.service_name || ''} — ${a.customer_name || ''}`}
                    style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
                    {fmtTime(a.start_time)} {a.service_name}
                  </div>
                ))}
                {list.length > 3 && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>+{list.length - 3} more</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week Grid ────────────────────────────────────────────────────────────────
function WeekGrid({ weekDays, apptsByDay, today, onSelect }) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '10px 8px' }} />
        {weekDays.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString()
          return (
            <div key={i} style={{ padding: '10px 6px', textAlign: 'center', borderLeft: '1px solid var(--border)',
              background: isToday ? 'var(--gold)11' : 'transparent' }}>
              <div style={{ fontSize: 11, color: isToday ? 'var(--gold)' : 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{DAYS[i]}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: isToday ? 'var(--gold)' : 'var(--text)', marginTop: 2 }}>{d.getDate()}</div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', position: 'relative' }}>
        {/* Hour rows */}
        {hours.map(h => (
          <div key={h} style={{ display: 'contents' }}>
            <div style={{ padding: '0 8px', height: 56, display: 'flex', alignItems: 'flex-start', paddingTop: 6,
              fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, borderBottom: '1px solid var(--border)11' }}>
              {timeLabel(h)}
            </div>
            {weekDays.map((_, i) => (
              <div key={i} style={{ height: 56, borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)11', position: 'relative' }} />
            ))}
          </div>
        ))}

        {/* Appointment blocks overlaid */}
        {apptsByDay.map((dayAppts, dayIdx) =>
          dayAppts.map(a => {
            const minsIn  = Math.max(0, minsFromDayStart(a.start_time))
            const durMins = Math.max(15, (new Date(a.end_time) - new Date(a.start_time)) / 60000)
            const topPct  = (minsIn / TOTAL_MINS) * 100
            const heightPct = (durMins / TOTAL_MINS) * 100
            const col   = STATUS_COLORS[a.status] || STATUS_COLORS.confirmed
            const startLabel = fmtTime(a.start_time)

            return (
              <div key={a.id} onClick={() => onSelect(a)}
                style={{
                  position: 'absolute',
                  top:    `calc(${topPct}% + 0px)`,
                  height: `calc(${heightPct}% - 2px)`,
                  left:   `calc(52px + ${dayIdx} * ((100% - 52px) / 7) + 3px)`,
                  width:  `calc((100% - 52px) / 7 - 6px)`,
                  background: col.bg,
                  border: `1px solid ${col.border}`,
                  borderLeft: `3px solid ${col.border}`,
                  borderRadius: 5,
                  padding: '3px 5px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  zIndex: 2,
                  transition: 'opacity .15s',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: col.text, lineHeight: 1.2 }}>{startLabel}</div>
                <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, lineHeight: 1.2, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.customer_name || '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.service_name}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Day List ─────────────────────────────────────────────────────────────────
function CalIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M8 3v3M16 3v3M3.5 9h17" />
    </svg>
  )
}
function ScissorsIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-0.15em' }}>
      <path d="M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      <path d="M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      <path d="M8.6 5.4L21 18M21 6L8.6 18.6" />
    </svg>
  )
}
function PhoneIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-0.15em' }}>
      <path d="M21 16.5v2.6a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.7-2.8 17.4 17.4 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3.1 5a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.5c.1.8.3 1.6.6 2.3a1.8 1.8 0 0 1-.4 1.9l-1.1 1.1a14.4 14.4 0 0 0 5.4 5.4l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.7.3 1.5.5 2.3.6a1.8 1.8 0 0 1 1.5 1.8z" />
    </svg>
  )
}

function DayList({ appts, day, onSelect }) {
  if (!appts || appts.length === 0) {
    return (
      <div className="empty-state">
        <div className="e-icon"><CalIcon size={28} /></div>
        No appointments on {fmtFull(day)}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
        {fmtFull(day)} · {appts.filter(a => a.status !== 'cancelled').length} appointment{appts.length !== 1 ? 's' : ''}
      </div>
      {appts.map(a => {
        const col  = STATUS_COLORS[a.status] || STATUS_COLORS.confirmed
        const time = fmtTime(a.start_time)
        const end  = fmtTime(a.end_time)
        const dur  = Math.round((new Date(a.end_time) - new Date(a.start_time)) / 60000)
        return (
          <div key={a.id} onClick={() => onSelect(a)}
            style={{ background: 'var(--surface)', border: `1px solid var(--border)`, borderLeft: `4px solid ${col.border}`,
              borderRadius: 8, padding: '14px 16px', cursor: 'pointer', transition: 'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ textAlign: 'right', minWidth: 52, flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: col.text }}>{time}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{end}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{a.customer_name || 'Unknown'}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', padding: '1px 6px', borderRadius: 3,
                    background: col.bg, color: col.text, border: `1px solid ${col.border}` }}>{a.status}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.service_name} · {dur} min</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {a.barber_name && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><ScissorsIcon size={12} />{a.barber_name}</span>}
                  {a.customer_phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><PhoneIcon size={12} />{a.customer_phone}</span>}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
