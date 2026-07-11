import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from '../components/Toast'
import Icon from '../components/Icon'

const TZ = 'Europe/London'
const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtTime = iso => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const EMPTY = { name: '', phone: '', email: '', notes: '' }

export default function Clients({ isAdmin }) {
  const [clients,  setClients]  = useState([])
  const [apptMap,  setApptMap]  = useState({}) // phone -> { count, last, next }
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [modal,    setModal]    = useState(null)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const now = new Date().toISOString()
    const [cl, appts] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('appointments').select('customer_phone, start_time, status').neq('status', 'cancelled'),
    ])
    setClients(cl.data || [])

    // Build per-phone appointment map
    const map = {}
    for (const a of (appts.data || [])) {
      const ph = a.customer_phone
      if (!ph) continue
      if (!map[ph]) map[ph] = { count: 0, last: null, next: null }
      map[ph].count++
      if (a.start_time < now) {
        if (!map[ph].last || a.start_time > map[ph].last) map[ph].last = a.start_time
      } else {
        if (!map[ph].next || a.start_time < map[ph].next) map[ph].next = a.start_time
      }
    }
    setApptMap(map)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
  })

  function openAdd()   { setForm(EMPTY); setModal('add') }
  function openEdit(c) { setForm({ ...c }); setModal(c) }
  function close()     { setModal(null) }
  function field(k)    { return e => setForm(f => ({ ...f, [k]: e.target.value })) }

  async function save() {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    if (modal === 'add') {
      const { error } = await supabase.from('clients').insert({
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), notes: form.notes.trim()
      })
      if (error) { setSaving(false); return toast.error(error.message) }
      toast.success('Client added')
    } else {
      const { error } = await supabase.from('clients').update({
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), notes: form.notes.trim()
      }).eq('id', form.id)
      if (error) { setSaving(false); return toast.error(error.message) }
      toast.success('Client updated')
    }
    setSaving(false)
    close()
    load()
  }

  async function remove() {
    if (!confirm(`Remove ${form.name}? This cannot be undone.`)) return
    setDeleting(true)
    const { error } = await supabase.from('clients').delete().eq('id', form.id)
    setDeleting(false)
    if (error) return toast.error(error.message)
    toast.success('Client removed')
    close()
    load()
  }

  function exportCSV() {
    const now = new Date().toISOString()
    const headers = ['Name', 'Phone', 'Email', 'Visits', 'Last Visit', 'Next Visit', 'Notes', 'Added']
    const rows = filtered.map(c => {
      const m = apptMap[c.phone] || {}
      return [
        c.name, c.phone || '', c.email || '',
        m.count || 0,
        m.last ? new Date(m.last).toLocaleDateString('en-GB') : '',
        m.next ? new Date(m.next).toLocaleDateString('en-GB') : '',
        c.notes || '',
        c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`)
    })
    const csv = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `clients-${now.slice(0, 10)}.csv`,
    })
    a.click(); URL.revokeObjectURL(a.href)
  }

  function exportPDF() {
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const rows = filtered.map(c => {
      const m = apptMap[c.phone] || {}
      return `<tr>
        <td>${esc(c.name)}</td>
        <td>${esc(c.phone)}</td>
        <td>${esc(c.email)}</td>
        <td style="text-align:center">${m.count || 0}</td>
        <td>${m.last ? new Date(m.last).toLocaleDateString('en-GB') : '—'}</td>
        <td>${m.next ? new Date(m.next).toLocaleDateString('en-GB') : '—'}</td>
      </tr>`
    }).join('')
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Client List</title><style>
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
        <h1>Barber Shop — Client List</h1>
        <div class="meta">Exported ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ${filtered.length} record${filtered.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Visits</th><th>Last Visit</th><th>Next Visit</th></tr></thead>
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
          <h1>Clients</h1>
          <div className="topbar-sub">All customer records</div>
        </div>
      </div>

      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Search name, phone, email…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 300, maxWidth: '100%' }}
          />
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={exportCSV}>↓ CSV</button>
            <button className="btn btn-ghost btn-sm" onClick={exportPDF}>↓ PDF</button>
            <button className="btn btn-gold" onClick={openAdd}>+ Add client</button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><div className="e-icon">⏳</div>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="e-icon"><Icon name="user" size={30} /></div>No clients found</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="hide-mobile">Phone</th>
                  <th className="hide-mobile">Email</th>
                  <th>Visits</th>
                  <th className="hide-mobile">Last visit</th>
                  <th className="hide-mobile">Next visit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const m = apptMap[c.phone] || {}
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 30, height: 30, background: 'var(--gold)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#111', flexShrink: 0 }}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                            {c.notes && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.notes}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="hide-mobile" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{c.phone || '—'}</td>
                      <td className="hide-mobile" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{c.email || '—'}</td>
                      <td>
                        <span className={`badge ${m.count ? 'badge-gold' : 'badge-gray'}`}>{m.count || 0}</span>
                      </td>
                      <td className="hide-mobile" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtTime(m.last)}</td>
                      <td className="hide-mobile" style={{ fontSize: 12, color: m.next ? 'var(--gold)' : 'var(--text-dim)' }}>{fmtTime(m.next)}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ padding: '10px 4px', fontSize: 12, color: 'var(--text-dim)' }}>
              {filtered.length} client{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
          <div className="modal">
            <div className="modal-header">
              <h2>{modal === 'add' ? 'Add Client' : 'Edit Client'}</h2>
              <button className="modal-close" onClick={close}>×</button>
            </div>
            <div className="form-grid cols-1" style={{ gap: 14 }}>
              <div className="form-group">
                <label>Full name *</label>
                <input type="text" value={form.name} onChange={field('name')} placeholder="e.g. James Smith" autoFocus />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={form.phone} onChange={field('phone')} placeholder="+44 7700 900000" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={field('email')} placeholder="client@example.com" />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input type="text" value={form.notes} onChange={field('notes')} placeholder="e.g. prefers fades, allergic to…" />
              </div>
            </div>
            <div className="modal-footer">
              {modal !== 'add' && (
                <button className="btn btn-danger" onClick={remove} disabled={deleting} style={{ marginRight: 'auto' }}>
                  {deleting ? 'Removing…' : 'Remove'}
                </button>
              )}
              <button className="btn btn-ghost" onClick={close}>Cancel</button>
              <button className="btn btn-gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
