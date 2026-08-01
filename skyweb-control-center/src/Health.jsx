import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { toast } from './Toast'

function ago(iso) {
  if (!iso) return 'never'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
const fmt = iso => iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export default function Health() {
  const [shops, setShops] = useState([])
  const [calls, setCalls] = useState([])
  const [notifFails, setNotifFails] = useState([])
  const [appts, setAppts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [shopsRes, callsRes, notifRes, apptsRes] = await Promise.all([
      supabase.from('shops').select('id, name, slug, status'),
      supabase.from('call_logs').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('notification_outbox').select('*').in('status', ['failed', 'dead']).order('created_at', { ascending: false }).limit(40),
      supabase.from('appointments').select('shop_id, created_at, status').order('created_at', { ascending: false }).limit(200),
    ])
    if (shopsRes.error) toast.error('Could not load shops: ' + shopsRes.error.message)
    if (callsRes.error) toast.error('Could not load call logs: ' + callsRes.error.message)
    setShops(shopsRes.data || [])
    setCalls(callsRes.data || [])
    setNotifFails(notifRes.data || [])
    setAppts(apptsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const shopName = id => shops.find(s => s.id === id)?.name || 'Unknown shop'
  const weekAgo = Date.now() - 7 * 86400 * 1000

  const perShop = shops.map(shop => {
    const shopCalls = calls.filter(c => c.shop_id === shop.id)
    const shopAppts = appts.filter(a => a.shop_id === shop.id)
    const shopNotifFails = notifFails.filter(n => n.shop_id === shop.id)
    const failedCalls7d = shopCalls.filter(c => c.outcome === 'failed' && new Date(c.created_at).getTime() > weekAgo)
    return {
      shop,
      lastCall: shopCalls[0]?.created_at || null,
      lastBooking: shopAppts[0]?.created_at || null,
      failedCalls7d: failedCalls7d.length,
      failedNotifs: shopNotifFails.length,
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Per-shop health</div>
        <button className="cc-btn cc-btn-ghost" onClick={load}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {perShop.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No shops yet.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {perShop.map(({ shop, lastCall, lastBooking, failedCalls7d, failedNotifs }) => {
            const problems = failedCalls7d > 0 || failedNotifs > 0
            return (
              <div key={shop.id} className="cc-card" style={problems ? { borderColor: 'var(--red-br)' } : {}}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: problems ? 'var(--red)' : 'var(--green)' }} />
                  <strong style={{ fontSize: 13.5 }}>{shop.name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({shop.slug})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
                  <Row label="Last call"       value={lastCall ? ago(lastCall) : 'never'} />
                  <Row label="Last booking"    value={lastBooking ? ago(lastBooking) : 'never'} />
                  <Row label="Failed calls (7d)" value={failedCalls7d} bad={failedCalls7d > 0} />
                  <Row label="Failed notifications" value={failedNotifs} bad={failedNotifs > 0} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Failed notifications (email/SMS)</div>
        {notifFails.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>None — all recent sends went through.</div>
        ) : (
          <div className="cc-card" style={{ padding: 0, overflow: 'hidden' }}>
            {notifFails.map((n, i) => (
              <div key={n.id} style={{ padding: '10px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span className="cc-badge" style={{ background: 'var(--red-bg)', color: 'var(--red)', borderColor: 'var(--red-br)', flexShrink: 0 }}>{n.status}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5 }}>{shopName(n.shop_id)} · {n.channel} · {n.template} → {n.to_address}</div>
                  {n.last_error && <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>{n.last_error}</div>}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fmt(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Recent calls, all shops</div>
        {calls.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No calls logged yet.</div>
        ) : (
          <div className="cc-card" style={{ padding: 0, overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
            {calls.map((c, i) => (
              <div key={c.id} style={{ padding: '9px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="cc-badge" style={
                  c.outcome === 'failed'
                    ? { background: 'var(--red-bg)', color: 'var(--red)', borderColor: 'var(--red-br)' }
                    : c.outcome === 'booked'
                      ? { background: 'var(--green-bg)', color: 'var(--green)', borderColor: 'var(--green-br)' }
                      : { background: 'var(--surface3)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                }>
                  {c.outcome || 'logged'}
                </span>
                <div style={{ flex: 1, fontSize: 12.5 }}>
                  <strong>{shopName(c.shop_id)}</strong> · {c.caller_name || 'Unknown'}{c.caller_phone ? ` · ${c.caller_phone}` : ''} · {c.intent || '—'}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{ago(c.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cc-card" style={{ borderColor: 'var(--amber-br)', background: 'var(--amber-bg)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--amber)', marginBottom: 6 }}>Not connected yet: n8n workflow errors &amp; Dograh</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          This page shows everything visible from Supabase — call outcomes, booking activity, and failed emails/SMS, per shop.
          It doesn't show which n8n <em>node</em> failed inside a workflow run, or anything from Dograh's own logs — neither
          is wired up yet, since both need an API credential from you before I can build the connection safely.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, bad }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: bad ? 'var(--red)' : 'var(--text)' }}>{value}</span>
    </div>
  )
}
