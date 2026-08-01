import { useEffect, useLayoutEffect, useState } from 'react'
import { supabase } from './supabase'
import { ToastContainer, toast } from './components/Toast'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import Overview from './pages/Overview'
import Services from './pages/Services'
import Calendar from './pages/Calendar'
import SettingsHub from './pages/SettingsHub'
import Clients from './pages/Clients'
import Calls from './pages/Calls'
import AutomationHealth from './pages/AutomationHealth'
import Usage from './pages/Usage'
import Waitlist from './pages/Waitlist'
import { ShopProvider } from './ShopContext'
import { BRAND } from './brand'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [profState, setProfState] = useState('loading') // loading | found | not_found
  const [page, setPage] = useState('overview')
  // Supabase logs invite/recovery links straight into a session via a token in
  // the URL hash, but never prompts for a password -- captured once, on first
  // render, before anything has a chance to strip the hash.
  const [authFlowType] = useState(() => {
    const m = /type=(invite|recovery)/.exec(window.location.hash)
    return m ? m[1] : null
  })
  const [passwordSet, setPasswordSet] = useState(false)

  // Light-only product. Clear any stale dark preference from earlier builds so
  // returning users don't get a half-styled page from the removed theme.
  useLayoutEffect(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.removeItem('theme')
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    if (!session?.user) { setProfile(null); setProfState('loading'); return }

    async function loadProfile() {
      const user = session.user
      // Try to find barber row by email
      let { data } = await supabase.from('barbers').select('*').eq('email', user.email).single()

      if (data) {
        // Auto-link user_id if not already set
        if (!data.user_id) {
          await supabase.from('barbers').update({ user_id: user.id }).eq('id', data.id)
          data = { ...data, user_id: user.id }
        }
        setProfile(data)
        setProfState('found')
      } else {
        setProfState('not_found')
      }
    }
    loadProfile()
  }, [session])

  // ── Loading splash ──
  if (session === undefined || (session && profState === 'loading')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        {BRAND.logoUrl && <img src={BRAND.logoUrl} style={{ width: 52, opacity: .6 }} alt="" />}
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</span>
      </div>
    )
  }

  // ── Not logged in ──
  if (!session) return <><Login /><ToastContainer /></>

  // ── Invite/recovery link logged them in, but they've never set a password ──
  if (authFlowType && !passwordSet) {
    return (
      <>
        <SetPassword
          mode={authFlowType}
          onDone={() => {
            setPasswordSet(true)
            window.history.replaceState(null, '', window.location.pathname)
          }}
        />
        <ToastContainer />
      </>
    )
  }

  // ── No barber profile found ──
  if (profState === 'not_found') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 24 }}>
        {BRAND.logoUrl && <img src={BRAND.logoUrl} style={{ width: 56 }} alt="" />}
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Access not set up</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 320 }}>
            Your account (<strong style={{ color: 'var(--text)' }}>{session.user.email}</strong>) isn't linked to a barber profile yet. Ask the admin to add your email in the Barbers section.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    )
  }

  // operator = SkyWeb staff on this client's instance. Operators are admins too.
  const isOperator = profile?.role === 'operator'
  const isAdmin    = profile?.role === 'admin' || isOperator

  return (
    <ShopProvider>
      <div className="layout">
        {/* keyboard users can jump past the nav (skill: skip-links) */}
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <Sidebar page={page} setPage={setPage} profile={profile} />
        <main className="main" id="main-content" tabIndex={-1}>
          {/* key={page} remounts the wrapper on each tab switch so the enter
              animation runs on navigation — a real layout transition */}
          <div className="page-transition" key={page}>
            {page === 'overview'  && <Overview    profile={profile} />}
            {page === 'calendar'  && <Calendar    profile={profile} />}
            {page === 'clients'   && <Clients          isAdmin={isAdmin} />}
            {page === 'waitlist'  && <Waitlist         isAdmin={isAdmin} />}
            {page === 'calls'     && <Calls />}
            {page === 'usage'     && <Usage            isOperator={isOperator} />}
            {/* diagnostics are SkyWeb's, not the shop's — gated on the route, not just hidden in nav */}
            {page === 'health'    && isOperator && <AutomationHealth />}
            {page === 'services'  && <Services         isAdmin={isAdmin} />}
            {page === 'settings'  && <SettingsHub      isAdmin={isAdmin} isOperator={isOperator} />}
          </div>
        </main>
        <ToastContainer />
      </div>
    </ShopProvider>
  )
}
