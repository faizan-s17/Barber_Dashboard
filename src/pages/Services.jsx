import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'

const EMPTY = { name: '', price: '', duration_minutes: 30, active: true }

export default function Services({ isAdmin }) {
  const [services, setServices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(null) // null | 'add' | service obj
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('services').select('*').order('sort_order')
    setServices(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openAdd()    { setForm(EMPTY);             setModal('add') }
  function openEdit(s)  { setForm({ ...s });           setModal(s) }
  function closeModal() { setModal(null) }

  function field(k) { return e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }

  async function save() {
    if (!form.name.trim() || !form.price.trim()) return toast.error('Name and price are required')
    setSaving(true)
    const payload = { name: form.name.trim(), price: form.price.trim(), duration_minutes: Number(form.duration_minutes) || 30, active: form.active }

    if (modal === 'add') {
      const maxOrder = services.reduce((m, s) => Math.max(m, s.sort_order || 0), 0)
      const { error: err } = await supabase.from('services').insert({ ...payload, sort_order: maxOrder + 1 })
      setSaving(false)
      if (err) { console.error('insert error', err); return toast.error('Could not add service: ' + err.message) }
    } else {
      const { data, error: err } = await supabase.from('services').update(payload).eq('id', form.id).select()
      setSaving(false)
      if (err) { console.error('update error', err); return toast.error('Could not update service: ' + err.message) }
      if (!data || data.length === 0) return toast.error('Update blocked — check Supabase RLS policies for the services table (need UPDATE policy for authenticated users)')
    }

    toast.success(modal === 'add' ? 'Service added' : 'Service updated')
    closeModal(); load()
  }

  async function toggleActive(s) {
    const { error: err } = await supabase.from('services').update({ active: !s.active }).eq('id', s.id)
    if (err) return toast.error(err.message)
    toast.success(s.active ? 'Service hidden' : 'Service shown')
    load()
  }

  async function remove(s) {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return
    const { error: err } = await supabase.from('services').delete().eq('id', s.id)
    if (err) return toast.error(err.message)
    toast.success('Service deleted')
    load()
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Services &amp; Prices</h1>
          <div className="topbar-sub">Manage your menu of services</div>
        </div>
      </div>
      <div className="page">
        <div className="page-header">
          <span className="page-title">{services.length} service{services.length !== 1 ? 's' : ''}</span>
          {isAdmin && <button className="btn btn-gold" onClick={openAdd}>+ Add service</button>}
        </div>

        {loading ? (
          <div className="empty-state"><div className="e-icon">⏳</div>Loading…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Price</th>
                  <th>Duration</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {services.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{s.price}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.duration_minutes} min</td>
                    <td>
                      <span className={`badge ${s.active ? 'badge-green' : 'badge-gray'}`}>
                        {s.active ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex-gap">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(s)}>
                            {s.active ? 'Hide' : 'Show'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => remove(s)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <h2>{modal === 'add' ? 'Add Service' : 'Edit Service'}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="form-grid cols-1" style={{ gap: 14 }}>
              <div className="form-group">
                <label>Service name</label>
                <input type="text" value={form.name} onChange={field('name')} placeholder="e.g. Haircut" autoFocus />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Price</label>
                  <input type="text" value={form.price} onChange={field('price')} placeholder="e.g. 18 pounds" />
                </div>
                <div className="form-group">
                  <label>Duration (minutes)</label>
                  <input type="number" value={form.duration_minutes} onChange={field('duration_minutes')} min="5" max="300" />
                </div>
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <label className="toggle">
                  <input type="checkbox" checked={form.active} onChange={field('active')} />
                  <span className="toggle-slider" />
                </label>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Show on menu</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
