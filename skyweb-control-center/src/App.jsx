import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Login from './Login'
import Dashboard from './Dashboard'
import { ToastHost } from './Toast'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [checkState, setCheckState] = useState('idle') // idle | checking | operator | denied

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

  return (
    <>
      <Dashboard operatorEmail={session.user.email} onSignOut={handleSignOut} />
      <ToastHost />
    </>
  )
}
