import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function defaultHours() {
  return { 1: ['09:00','19:00'], 2: ['09:00','19:00'], 3: ['09:00','19:00'], 4: ['09:00','19:00'], 5: ['09:00','19:00'], 6: ['09:00','17:00'], 7: null }
}

export default function OpeningHours({ isAdmin }) {
  const [hours,   setHours]   = useState(defaultHours())
  const [id,      setId]      = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('shop_config').select('id, open_hours').single().then(({ data }) => {
      if (data) { setId(data.id); setHours(data.open_hours || defaultHours()) }
      setLoading(false)
    })
  }, [])

  function setOpen(dayNum, val) {
    setHours(h => ({ ...h, [dayNum]: val ? ['09:00','17:00'] : null }))
  }
  function setTime(dayNum, idx, val) {
    setHours(h => {
      const day = [...(h[dayNum] || ['09:00','17:00'])]
      day[idx] = val
      return { ...h, [dayNum]: day }
    })
  }

  async function save() {
    setSaving(true)
    const { error: err } = await supabase.from('shop_config').update({ open_hours: hours, updated_at: new Date().toISOString() }).eq('id', id)
    setSaving(false)
    if (err) return toast.error(err.message)
    toast.success('Opening hours saved')
  }

  if (loading) return (
    <>
      <div className="topbar"><div><h1>Opening Hours</h1></div></div>
      <div className="page"><div className="empty-state"><div className="e-icon">⏳</div>Loading…</div></div>
    </>
  )

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Opening Hours</h1>
          <div className="topbar-sub">Set when your shop is open each day</div>
        </div>
      </div>
      <div className="page">
        <div className="card">
          <div className="hours-grid">
            <div className="hours-header" style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 90px', gap: 10, padding: '0 14px 8px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.7px' }}>
              <span>Day</span><span>Opens</span><span>Closes</span><span>Open?</span>
            </div>
            {DAYS.map((name, i) => {
              const dayNum = i + 1
              const slot = hours[dayNum]
              const isOpen = slot !== null
              return (
                <div key={dayNum} className="hours-row" style={{ opacity: isOpen ? 1 : .5 }}>
                  <span className="hours-day">{name}</span>
                  {isOpen ? (
                    <>
                      <input type="time" value={slot[0]} onChange={e => setTime(dayNum, 0, e.target.value)} disabled={!isAdmin} />
                      <input type="time" value={slot[1]} onChange={e => setTime(dayNum, 1, e.target.value)} disabled={!isAdmin} />
                    </>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-dim)', gridColumn: '2 / 4' }}>Closed all day</span>
                  )}
                  <label className="toggle" style={{ marginLeft: 'auto' }}>
                    <input type="checkbox" checked={isOpen} onChange={e => isAdmin && setOpen(dayNum, e.target.checked)} disabled={!isAdmin} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              )
            })}
          </div>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : '✓ Save hours'}</button>
          </div>
        )}
      </div>
    </>
  )
}
