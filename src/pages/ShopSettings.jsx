import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'

export default function ShopSettings({ isAdmin }) {
  const [form,    setForm]    = useState(null)
  const [id,      setId]      = useState(null)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    supabase.from('shop_config').select('*').single().then(({ data }) => {
      if (data) { setId(data.id); setForm(data) }
    })
  }, [])

  function field(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function save() {
    if (!form.name.trim()) return toast.error('Shop name is required')
    setSaving(true)
    const { error: err } = await supabase.from('shop_config').update({
      name: form.name,
      address: form.address,
      phone: form.phone,
      shop_email: form.shop_email,
      parking: form.parking,
      cancellation: form.cancellation,
      hours_text: form.hours_text,
      timezone: form.timezone,
      payment: form.payment,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    setSaving(false)
    if (err) return toast.error(err.message)
    toast.success('Shop settings saved')
  }

  if (!form) return (
    <>
      <div className="topbar"><div><h1>Shop Settings</h1></div></div>
      <div className="page"><div className="empty-state"><div className="e-icon">⏳</div>Loading…</div></div>
    </>
  )

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Shop Settings</h1>
          <div className="topbar-sub">Update your shop details, contact info and policies</div>
        </div>
      </div>

      <div className="page">
        {/* Basic info */}
        <div className="card gap-20">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--gold)' }}>Basic Information</div>
          <div className="form-grid" style={{ gap: 16 }}>
            <div className="form-group">
              <label>Shop name</label>
              <input type="text" value={form.name} onChange={field('name')} disabled={!isAdmin} />
            </div>
            <div className="form-group">
              <label>Phone number</label>
              <input type="text" value={form.phone} onChange={field('phone')} disabled={!isAdmin} />
            </div>
            <div className="form-group full">
              <label>Address</label>
              <input type="text" value={form.address} onChange={field('address')} disabled={!isAdmin} />
            </div>
            <div className="form-group">
              <label>Shop email (receives admin notifications)</label>
              <input type="email" value={form.shop_email} onChange={field('shop_email')} disabled={!isAdmin} />
            </div>
            <div className="form-group">
              <label>Timezone</label>
              <select value={form.timezone} onChange={field('timezone')} disabled={!isAdmin}>
                <option value="Europe/London">Europe/London (UK)</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
                <option value="Asia/Karachi">Asia/Karachi</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
              </select>
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Policies */}
        <div className="card gap-20">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--gold)' }}>Policies &amp; Info</div>
          <div className="form-grid cols-1" style={{ gap: 14 }}>
            <div className="form-group">
              <label>Parking info (shown in confirmation emails)</label>
              <textarea value={form.parking || ''} onChange={field('parking')} disabled={!isAdmin} rows={2} />
            </div>
            <div className="form-group">
              <label>Cancellation policy (shown in emails)</label>
              <textarea value={form.cancellation || ''} onChange={field('cancellation')} disabled={!isAdmin} rows={2} />
            </div>
            <div className="form-group">
              <label>Payment methods (for FAQ responses)</label>
              <textarea value={form.payment || ''} onChange={field('payment')} disabled={!isAdmin} rows={2} />
            </div>
            <div className="form-group">
              <label>Hours text (for voice AI responses)</label>
              <textarea value={form.hours_text || ''} onChange={field('hours_text')} disabled={!isAdmin} rows={2} />
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="save-bar" style={{ borderTop: 'none', paddingLeft: 0, marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => window.location.reload()}>Discard</button>
            <button className="btn btn-gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : '✓ Save settings'}</button>
          </div>
        )}
      </div>
    </>
  )
}
