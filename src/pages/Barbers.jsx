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
  const [exportOpen, setExportOpen] = useState(false)
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

  function exportCSV() {
    const headers = ['Name', 'Email', 'Role', 'Status']
    const rows = barbers.map(b => [b.name, b.email || '', b.role, b.active ? 'Active' : 'Inactive']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
    )
    const csv = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `barbers-${new Date().toISOString().slice(0, 10)}.csv`,
    })
    a.click(); URL.revokeObjectURL(a.href)
  }

  function exportPDF() {
    const rows = barbers.map(b => {
      const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const statusColor = b.active ? '#16a34a' : '#6b7280'
      return `<tr>
        <td>${esc(b.name)}</td>
        <td>${esc(b.email)}</td>
        <td>${esc(b.role)}</td>
        <td style="color:${statusColor};font-weight:600">${b.active ? 'Active' : 'Inactive'}</td>
      </tr>`
    }).join('')
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Staff List</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;padding:28px;color:#111}
      .header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #d4a017}
      h1{font-size:20px;font-weight:700;color:#0f2027}
      .meta{font-size:11px;color:#666;margin-top:4px}
      table{border-collapse:collapse;width:100%}
      th{background:#0f2027;color:#d4a017;text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.6px}
      td{padding:7px 10px;border-bottom:1px solid #e8e8e8;font-size:12px}
      tr:nth-child(even) td{background:#f7f9fa}
      @media print{body{padding:16px}thead{display:table-header-group}}
    </style></head><body>
    <div class="header">
      <div>
        <h1>Barber Shop — Staff List</h1>
        <div class="meta">Exported ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${barbers.length} record${barbers.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 400)
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
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setExportOpen(o => !o)}>Export ▾</button>
              {exportOpen && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', zIndex: 50, minWidth: 130, boxShadow: '0 4px 16px rgba(0,0,0,.35)' }}
                  onMouseLeave={() => setExportOpen(false)}>
                  <div style={{ padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
                    className="dropdown-item" onClick={() => { exportCSV(); setExportOpen(false) }}>Download CSV</div>
                  <div style={{ padding: '6px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
                    className="dropdown-item" onClick={() => { exportPDF(); setExportOpen(false) }}>Save as PDF</div>
                </div>
              )}
            </div>
            {isAdmin && <button className="btn btn-gold" onClick={openAdd}>+ Add barber</button>}
          </div>
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
