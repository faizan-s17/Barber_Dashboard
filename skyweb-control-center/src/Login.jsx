import { useState } from 'react'
import { supabase } from './supabase'

export default function Login({ deniedReason }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={handleSubmit} className="cc-card" style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <span className="cc-brand-dot" />
          <div>
            <strong style={{ fontSize: 15 }}>SkyWeb Control Center</strong>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Operator access only</div>
          </div>
        </div>

        {deniedReason && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-br)', color: 'var(--red)', borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 14 }}>
            {deniedReason}
          </div>
        )}
        {error && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red-br)', color: 'var(--red)', borderRadius: 8, padding: '9px 12px', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="cc-input" type="email" placeholder="you@skyweb.co" value={email}
            onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="username" />
          <input className="cc-input" type="password" placeholder="••••••••" value={password}
            onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>

        <button type="submit" className="cc-btn cc-btn-primary" disabled={loading} style={{ width: '100%', marginTop: 16 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
