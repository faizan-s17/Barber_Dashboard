import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Login from './Login'
import Dashboard from './Dashboard'
import Health from './Health'
import { ToastHost } from './Toast'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [checkState, setCheckState] = useState('idle') // idle | checking | operator | denied
  const [page, setPage] = useState('shops') // shops | health

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (!session?.user) { setCheckState('idle'); return }

    let cancelled = false
    setCheckState('checking')
    supabase.from('barbers').select('role').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setCheckState(data?.role === 'operator' ? 'operator' : 'denied')
      })
    return () => { cancelled = true }
  }, [session])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setCheckState('idle')
  }

  // Auto sign-out a non-operator exactly once, as a side effect -- not inline
  // during render, which would fire on every re-render while denied persists.
  useEffect(() => {
    if (checkState === 'denied') handleSignOut()
  }, [checkState])

  if (session === undefined || checkState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (!session) return <><Login /><ToastHost /></>

  if (checkState === 'denied') {
    return (
      <>
        <Login deniedReason={`${session.user.email} is not an operator account. Signing you out.`} />
        <ToastHost />
      </>
    )
  }

  const TABS = [
    { id: 'shops',  label: 'Shops' },
    { id: 'health', label: 'Health' },
  ]

  return (
    <div className="cc-shell">
      <div className="cc-topbar">
        <div className="cc-brand">
          <span className="cc-brand-dot" />
          <div className="cc-brand-text">
            <strong>SkyWeb Control Center</strong>
            <span>Operator console</span>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 8, padding: 3 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setPage(t.id)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all .15s',
                background: page === t.id ? 'var(--accent)' : 'transparent',
                color: page === t.id ? '#fff' : 'var(--text-muted)',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{session.user.email}</span>
          <button className="cc-btn cc-btn-ghost" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>

      <div className="cc-main">
        {page === 'shops' && <Dashboard />}
        {page === 'health' && <Health />}
      </div>

      <ToastHost />
    </div>
  )
}
