import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { toast } from './Toast'

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London',
]

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const BLANK = {
  shop_name: '', slug: '', timezone: 'America/New_York',
  admin_name: '', admin_email: '', twilio_from_number: '', google_calendar_id: '',
}

export default function Dashboard() {
  const [form, setForm] = useState(BLANK)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [shops, setShops] = useState([])
  const [loadingShops, setLoadingShops] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const loadShops = async () => {
    setLoadingShops(true)
    const { data } = await supabase.from('shops').select('*').order('created_at', { ascending: false })
    setShops(data || [])
    setLoadingShops(false)
  }

  useEffect(() => { loadShops() }, [])

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'shop_name' && !slugTouched) next.slug = slugify(val)
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.shop_name.trim())   return toast.error('Shop name is required')
    if (!form.slug.trim())        return toast.error('Slug is required')
    if (!form.admin_name.trim())  return toast.error('Admin name is required')
    if (!form.admin_email.trim()) return toast.error('Admin email is required')

    setSaving(true)
    setResult(null)
    const { data, error } = await supabase.functions.invoke('onboard-shop', {
      body: {
        shop_name: form.shop_name.trim(),
        slug: form.slug.trim(),
        timezone: form.timezone,
        admin_name: form.admin_name.trim(),
        admin_email: form.admin_email.trim(),
        twilio_from_number: form.twilio_from_number.trim() || null,
        google_calendar_id: form.google_calendar_id.trim() || null,
      },
    })
    setSaving(false)

    if (error || data?.error) {
      toast.error('Onboarding failed: ' + (data?.error || error.message))
      return
    }

    setResult(data)
    setForm(BLANK)
    setSlugTouched(false)
    toast.success('Shop created')
    loadShops()
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {result && (
        <div className="cc-card" style={{ borderColor: 'var(--green-br)', background: 'var(--green-bg)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--green)' }}>
            Shop created — send these to the owner
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="cc-label" style={{ color: 'var(--text-dim)' }}>Admin invite link</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <code className="cc-code" style={{ flex: 1, color: 'var(--text)' }}>{result.invite_link || '(no link returned)'}</code>
                {result.invite_link && <button className="cc-btn cc-btn-ghost" onClick={() => copy(result.invite_link, 'Invite link')}>Copy</button>}
              </div>
            </div>
            <div>
              <div className="cc-label" style={{ color: 'var(--text-dim)' }}>Webhook secret — X-Webhook-Secret preset header on this shop's voice-agent tool</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <code className="cc-code" style={{ flex: 1, color: 'var(--text)' }}>{result.webhook_secret}</code>
                <button className="cc-btn cc-btn-ghost" onClick={() => copy(result.webhook_secret, 'Webhook secret')}>Copy</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Still manual: connecting this shop's Google Calendar and Twilio number if left blank above. Both can be added later — the workflow reads them per shop already.
            </div>
          </div>
        </div>
      )}

      <div className="cc-card" style={{ maxWidth: 560 }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="cc-label">Shop</div>
            <input className="cc-input" placeholder="Shop name *" value={form.shop_name} onChange={e => set('shop_name', e.target.value)} />
            <div>
              <input className="cc-input" placeholder="slug *" value={form.slug}
                onChange={e => { setSlugTouched(true); set('slug', slugify(e.target.value)) }} />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Lowercase letters, numbers, hyphens.</div>
            </div>
            <select className="cc-input" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>

            <div className="cc-label" style={{ marginTop: 8 }}>First admin</div>
            <input className="cc-input" placeholder="Admin full name *" value={form.admin_name} onChange={e => set('admin_name', e.target.value)} />
            <input className="cc-input" type="email" placeholder="Admin email *" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} />

            <div className="cc-label" style={{ marginTop: 8 }}>Optional — can add later</div>
            <input className="cc-input" placeholder="Twilio number, e.g. +14155551234" value={form.twilio_from_number} onChange={e => set('twilio_from_number', e.target.value)} />
            <input className="cc-input" placeholder="Google Calendar ID (an email address)" value={form.google_calendar_id} onChange={e => set('google_calendar_id', e.target.value)} />
          </div>

          <button type="submit" className="cc-btn cc-btn-primary" disabled={saving} style={{ marginTop: 18 }}>
            {saving ? 'Creating…' : 'Create shop'}
          </button>
        </form>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>All shops</div>
        {loadingShops ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
        ) : shops.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No shops yet.</div>
        ) : (
          <div className="cc-card" style={{ padding: 0, overflow: 'hidden' }}>
            {shops.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.slug}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="cc-badge" style={
                    s.status === 'active'
                      ? { background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-br)' }
                      : { background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-br)' }
                  }>
                    {s.status}
                  </span>
                  <button className="cc-btn cc-btn-ghost" style={{ color: 'var(--red)', borderColor: 'var(--red-br)' }}
                    onClick={() => setDeleteTarget(s)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteShopModal
          shop={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); loadShops() }}
        />
      )}
    </div>
  )
}

function DeleteShopModal({ shop, onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const canDelete = confirmText === shop.slug

  async function handleDelete() {
    if (!canDelete) return
    setDeleting(true)
    const { data, error } = await supabase.functions.invoke('delete-shop', {
      body: { shop_id: shop.id, confirm_slug: confirmText },
    })
    setDeleting(false)
    if (error || data?.error) {
      toast.error('Delete failed: ' + (data?.error || error.message))
      return
    }
    toast.success(`${shop.name} deleted`)
    onDeleted()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cc-card" style={{ width: '100%', maxWidth: 420, borderColor: 'var(--red-br)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--red)', marginBottom: 8 }}>Delete "{shop.name}"?</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          This permanently deletes the shop, every booking, customer, staff account, and login it has. There's no undo.
        </p>
        <div className="cc-label" style={{ color: 'var(--text-dim)' }}>Type "{shop.slug}" to confirm</div>
        <input className="cc-input" value={confirmText} onChange={e => setConfirmText(e.target.value)} autoFocus />
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="cc-btn cc-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="cc-btn"
            style={{ background: canDelete ? 'var(--red)' : 'var(--surface3)', color: canDelete ? '#fff' : 'var(--text-dim)', cursor: canDelete ? 'pointer' : 'not-allowed' }}
            disabled={!canDelete || deleting}
            onClick={handleDelete}
          >
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}
