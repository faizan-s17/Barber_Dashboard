import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'
import Icon from '../components/Icon'

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London',
]

function slugify(s) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const BLANK = {
  shop_name: '', slug: '', timezone: 'America/New_York',
  admin_name: '', admin_email: '', twilio_from_number: '', google_calendar_id: '',
}

export default function OnboardShop() {
  const [form, setForm] = useState(BLANK)
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [shops, setShops] = useState([])
  const [loadingShops, setLoadingShops] = useState(true)

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
    if (!form.shop_name.trim())  return toast.error('Shop name is required')
    if (!form.slug.trim())       return toast.error('Slug is required')
    if (!form.admin_name.trim()) return toast.error('Admin name is required')
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
    toast.success('Shop created!')
    loadShops()
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: 'var(--surface2)',
    border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)',
    fontSize: 13, boxSizing: 'border-box'
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Onboard a Barber Shop</h1>
          <div className="topbar-sub">Create a new tenant, its first admin, and the credentials needed to wire up its phone line</div>
        </div>
      </div>

      <div className="page" style={{ paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {result && (
          <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-br)', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="checkCircle" size={18} style={{ color: 'var(--green)' }} />
              <strong style={{ fontSize: 15 }}>Shop created — finish setup with these</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                  Admin invite link — send this to {result.slug ? 'the shop\'s admin' : 'them'} to set a password and log in
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <code style={{ flex: 1, padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, wordBreak: 'break-all' }}>
                    {result.invite_link || '(no link returned)'}
                  </code>
                  {result.invite_link && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(result.invite_link, 'Invite link')}>Copy</button>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                  Webhook secret — paste as an <code>X-Webhook-Secret</code> preset header on this shop's voice-agent tool
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <code style={{ flex: 1, padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, wordBreak: 'break-all' }}>
                    {result.webhook_secret}
                  </code>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(result.webhook_secret, 'Webhook secret')}>Copy</button>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Still manual: connecting this shop's own Google Calendar and buying/assigning a Twilio number, if you didn't set them below. Both can be filled in later — the workflow already reads them dynamically per shop.
              </div>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 22px', maxWidth: 560 }}>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: -6 }}>Shop</div>
              <input style={inputStyle} placeholder="Shop name *" value={form.shop_name}
                onChange={e => set('shop_name', e.target.value)} />
              <div>
                <input style={inputStyle} placeholder="slug *" value={form.slug}
                  onChange={e => { setSlugTouched(true); set('slug', slugify(e.target.value)) }} />
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Used internally to identify the shop. Lowercase letters, numbers, hyphens.</div>
              </div>
              <select style={inputStyle} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: -6, marginTop: 8 }}>First Admin</div>
              <input style={inputStyle} placeholder="Admin full name *" value={form.admin_name}
                onChange={e => set('admin_name', e.target.value)} />
              <input style={inputStyle} placeholder="Admin email *" type="email" value={form.admin_email}
                onChange={e => set('admin_email', e.target.value)} />

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: -6, marginTop: 8 }}>Optional — can add later</div>
              <input style={inputStyle} placeholder="Twilio number, e.g. +14155551234" value={form.twilio_from_number}
                onChange={e => set('twilio_from_number', e.target.value)} />
              <input style={inputStyle} placeholder="Google Calendar ID (an email address)" value={form.google_calendar_id}
                onChange={e => set('google_calendar_id', e.target.value)} />
            </div>

            <div style={{ marginTop: 18 }}>
              <button type="submit" className="btn btn-gold" disabled={saving}>
                {saving ? 'Creating…' : 'Create Shop'}
              </button>
            </div>
          </form>
        </div>

        <div>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>Existing shops</h2>
          {loadingShops ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
          ) : shops.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No shops yet.</div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {shops.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.slug}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', padding: '2px 8px', borderRadius: 4,
                    background: s.status === 'active' ? 'var(--green-bg)' : 'var(--amber-bg)',
                    color: s.status === 'active' ? 'var(--green)' : 'var(--amber)',
                    border: `1px solid ${s.status === 'active' ? 'var(--green-br)' : 'var(--amber-br)'}` }}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
