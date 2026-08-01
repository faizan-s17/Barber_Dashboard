import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'
import Icon from '../components/Icon'

// Manages the active usage package: what the client is paying for and what counts against it.
// Only one package may be active at a time (enforced by a partial unique index in Postgres).

const BLANK = {
  plan_name: '', included_calls: 300, included_minutes: 1000, cap_mode: 'either',
  period_start: '', period_end: '', overage_per_minute: 0.12, overage_per_call: 0,
  monthly_price: 0, timezone: 'Europe/London', active: true,
}

function firstOfMonth(offset = 0) {
  const d = new Date()
  const dt = new Date(d.getFullYear(), d.getMonth() + offset, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`
}

export default function PackageSettings({ isOperator }) {
  const [pkg,     setPkg]     = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('usage_packages').select('*').eq('active', true).maybeSingle()
    if (data) { setPkg(data); setForm(data) }
    else setForm({ ...BLANK, period_start: firstOfMonth(0), period_end: firstOfMonth(1) })
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.plan_name.trim()) return toast.error('Give the plan a name')
    if (!(form.period_end > form.period_start)) return toast.error('Period end must be after the start')
    setSaving(true)
    const payload = {
      plan_name: form.plan_name.trim(),
      included_calls:   form.included_calls   === '' ? null : Number(form.included_calls),
      included_minutes: form.included_minutes === '' ? null : Number(form.included_minutes),
      cap_mode: form.cap_mode,
      period_start: form.period_start, period_end: form.period_end,
      overage_per_minute: Number(form.overage_per_minute) || 0,
      overage_per_call:   Number(form.overage_per_call)   || 0,
      monthly_price:      Number(form.monthly_price)      || 0,
      timezone: form.timezone, active: true,
    }
    const { error } = pkg
      ? await supabase.from('usage_packages').update(payload).eq('id', pkg.id)
      : await supabase.from('usage_packages').insert(payload)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Package saved')
    load()
  }

  async function rollPeriod() {
    if (!pkg) return
    // close the current period and open the next one, carrying the plan terms over
    setSaving(true)
    const next = { ...pkg }
    delete next.id; delete next.created_at
    next.period_start = pkg.period_end
    const d = new Date(pkg.period_end + 'T00:00:00')
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    next.period_end = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-01`

    // the partial unique index allows only one active row, so retire the old one first
    const { error: e1 } = await supabase.from('usage_packages').update({ active: false }).eq('id', pkg.id)
    if (e1) { setSaving(false); return toast.error(e1.message) }
    const { error: e2 } = await supabase.from('usage_packages').insert({ ...next, active: true })
    setSaving(false)
    if (e2) return toast.error(e2.message)
    toast.success('Rolled into the next period')
    load()
  }

  if (loading) return <div className="empty-state"><div className="e-icon"><Icon name="loader" size={28} className="spin" /></div>Loading…</div>

  // The shop is billed against this plan — they see it, SkyWeb sets it.
  if (!isOperator) {
    return (
      <div className="card">
        {pkg ? (
          <>
            <div className="card-title"><Icon name="gauge" size={14} /> Your plan</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', fontSize: 'var(--fs-sm)' }}>
              <Row label="Plan"     value={pkg.plan_name} />
              <Row label="Included" value={`${pkg.included_minutes ?? 'Unlimited'} minutes · ${pkg.included_calls ?? 'Unlimited'} calls`} />
              <Row label="Renews"   value={new Date(pkg.period_end + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} />
              {pkg.monthly_price > 0 && <Row label="Price" value={`£${Number(pkg.monthly_price).toFixed(2)} / month`} />}
            </div>
            <div style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Want a bigger allowance or a change to your plan? Just get in touch and we'll
              sort it out.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
            No plan set up yet. Get in touch and we'll get you going.
          </div>
        )}
      </div>
    )
  }

  const isPlaceholder = pkg?.plan_name?.includes('PLACEHOLDER')

  return (
    <div className="card">
      {isPlaceholder && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderLeft: '3px solid var(--amber)',
                      background: 'var(--surface2, rgba(255,255,255,.04))', borderRadius: 6, fontSize: 13 }}>
          <Icon name="alert" size={14} style={{ color: 'var(--amber)', marginRight: 6 }} />
          This is the placeholder package created during setup. Replace the name, limits and
          dates with the real plan before invoicing anyone against it.
        </div>
      )}

      <div className="form-grid">
        <div className="form-group">
          <label>Plan name</label>
          <input value={form.plan_name} onChange={e => set('plan_name', e.target.value)} placeholder="Starter 300" />
        </div>
        <div className="form-group">
          <label>Monthly price (£)</label>
          <input type="number" step="0.01" value={form.monthly_price} onChange={e => set('monthly_price', e.target.value)} />
        </div>

        <div className="form-group">
          <label>Included minutes <span style={{ color: 'var(--text-dim)' }}>(blank = unmetered)</span></label>
          <input type="number" value={form.included_minutes ?? ''} onChange={e => set('included_minutes', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Included calls <span style={{ color: 'var(--text-dim)' }}>(blank = unmetered)</span></label>
          <input type="number" value={form.included_calls ?? ''} onChange={e => set('included_calls', e.target.value)} />
        </div>

        <div className="form-group">
          <label>Period start</label>
          <input type="date" value={form.period_start || ''} onChange={e => set('period_start', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Period end <span style={{ color: 'var(--text-dim)' }}>(exclusive)</span></label>
          <input type="date" value={form.period_end || ''} onChange={e => set('period_end', e.target.value)} />
        </div>

        <div className="form-group">
          <label>Cap applies to</label>
          <select value={form.cap_mode} onChange={e => set('cap_mode', e.target.value)}>
            <option value="either">Whichever runs out first</option>
            <option value="minutes">Minutes only</option>
            <option value="calls">Calls only</option>
          </select>
        </div>
        <div className="form-group">
          <label>Overage per minute (£)</label>
          <input type="number" step="0.01" value={form.overage_per_minute} onChange={e => set('overage_per_minute', e.target.value)} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.6 }}>
        Calls are billed per call, rounded up to the next whole minute, minimum one minute —
        the same way a phone bill counts them. Period end is exclusive, so a month runs
        1&nbsp;Aug → 1&nbsp;Sep.
      </div>

      <div className="save-bar" style={{ marginTop: 16 }}>
        <button className="btn btn-gold" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : pkg ? 'Save changes' : 'Create package'}
        </button>
        {pkg && (
          <button className="btn btn-ghost" onClick={rollPeriod} disabled={saving} style={{ marginLeft: 8 }}
                  title="Close this period and start the next one on the same terms">
            Roll to next period
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
