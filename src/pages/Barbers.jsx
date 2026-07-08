import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'

const EMPTY = { name: '', email: '', role: 'barber', active: true }

export default function Barbers({ isAdmin }) {
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)
  const [invPwd,  setInvPwd]  = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('barbers').select('*').order('created_at')
    setBarbers(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openAdd()   { setForm(EMPTY); setInvPwd(''); setModal('add') }
  function openEdit(b) { setForm({ ...b }); setInvPwd(''); setModal(b) }
  function close()     { setModal(null) }
  function field(k)    { return e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }

  async function save() {
    if (!form.name.trim() || !form.email.trim()) return toast.error('Name and email are required')
    setSaving(true)

    if (modal === 'add') {
      if (!invPwd || invPwd.length < 6) { setSaving(false); return toast.error('Password must be at least 6 characters') }
      // Create Supabase auth user then insert barber row
      const { data: authData, error: authErr } = await supabase.auth.admin?.createUser?.({
        email: form.email.trim(), password: invPwd, email_confirm: true
      }) ?? { error: 'Admin API not available from client' }

      // Fallback: insert barber row without linking auth user (admin will link manually)
      const { error: err } = await supabase.from('barbers').insert({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        active: form.active,
        user_id: authData?.user?.id || null
      })
      setSaving(false)
      if (err) return toast.error(err.message)
      toast.success('Barber added. They can now sign up with their email.')
    } else {
      const { error: err } = await supabase.from('barbers').update({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        active: form.active
      }).eq('id', form.id)
      setSaving(false)
      if (err) return toast.error(err.message)
      toast.success('Barber updated')
    }
    close(); load()
  }

  async function remove(b) {
    if (!confirm(`Remove ${b.name}? This cannot be undone.`)) return
    const { error: err } = await supabase.from('barbers').delete().eq('id', b.id)
    if (err) return toast.error(err.message)
    toast.success('Barber removed')
    load()
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Barbers</h1>
          <div className="topbar-sub">Manage staff accounts and roles</div>
        </div>
      </div>
      <div className="page">
        <div className="page-header">
          <span className="page-title">{barbers.length} barber{barbers.length !== 1 ? 's' : ''}</span>
          {isAdmin && <button className="btn btn-gold" onClick={openAdd}>+ Add barber</button>}
        </div>

        {loading ? (
          <div className="empty-state"><div className="e-icon">⏳</div>Loading…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Barber</th>
                  <th className="hide-mobile">Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {barbers.map(b => (
                  <tr key={b.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, background: 'var(--gold)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: '#111', flexShrink: 0 }}>
                          {b.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{b.name}</span>
                      </div>
                    </td>
                    <td className="hide-mobile" style={{ color: 'var(--text-muted)' }}>{b.email}</td>
                    <td>
                      <span className={`badge ${b.role === 'admin' ? 'badge-gold' : 'badge-gray'}`}>{b.role}</span>
                    </td>
                    <td>
                      <span className={`badge ${b.active ? 'badge-green' : 'badge-gray'}`}>
                        {b.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex-gap">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => remove(b)}>Remove</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isAdmin && (
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--gold)' }}>How to give barbers login access</div>
            <ol style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 18, lineHeight: 2 }}>
              <li>Add the barber above with their email address</li>
              <li>Go to your <strong style={{ color: 'var(--text)' }}>Supabase dashboard</strong> → Authentication → Users</li>
              <li>Click <strong style={{ color: 'var(--text)' }}>Invite user</strong> and enter their email</li>
              <li>They'll receive an email to set their password</li>
              <li>Once they sign in, their <code style={{ background: 'var(--surface3)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>user_id</code> links automatically</li>
            </ol>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
          <div className="modal">
            <div className="modal-header">
              <h2>{modal === 'add' ? 'Add Barber' : 'Edit Barber'}</h2>
              <button className="modal-close" onClick={close}>×</button>
            </div>
            <div className="form-grid cols-1" style={{ gap: 14 }}>
              <div className="form-group">
                <label>Full name</label>
                <input type="text" value={form.name} onChange={field('name')} placeholder="e.g. Faizan" autoFocus />
              </div>
              <div className="form-group">
                <label>Email address</label>
                <input type="email" value={form.email} onChange={field('email')} placeholder="barber@example.com" />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={form.role} onChange={field('role')}>
                  <option value="barber">Barber</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <label className="toggle">
                  <input type="checkbox" checked={form.active} onChange={field('active')} />
                  <span className="toggle-slider" />
                </label>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Active</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={close}>Cancel</button>
              <button className="btn btn-gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
