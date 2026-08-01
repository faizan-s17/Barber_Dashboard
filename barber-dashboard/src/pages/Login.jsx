import { useRef, useState } from 'react'
import { supabase } from '../supabase'
import { BRAND } from '../brand'
import Icon from '../components/Icon'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const emailRef = useRef(null)

  async function handleForgotPassword(e) {
    e.preventDefault()
    if (!email) {
      setError('Enter your email above first, then click "Forgot your password?"')
      emailRef.current?.focus()
      return
    }
    setError('')
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    // Supabase always reports success here regardless of whether the email
    // exists, so this can't be used to probe which emails have accounts.
    setResetSent(true)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(
        err.message?.toLowerCase().includes('invalid')
          ? 'That email and password don’t match. Check them and try again.'
          : err.message
      )
      emailRef.current?.focus()
    }
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card-split">
          {/* ── Left: form ── */}
          <form className="login-form-side" onSubmit={handleLogin}>
            <div className="login-form-inner">
              <div className="login-heading">
                {BRAND.logoUrl && <img src={BRAND.logoUrl} alt="" className="login-brand-logo" />}
                <h1>Welcome back</h1>
                <p>Sign in to your {BRAND.name} account</p>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <Icon name="alert" size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                  {error}
                </div>
              )}

              {resetSent && (
                <div className="login-error" role="status" style={{ background: 'var(--green-bg)', borderColor: 'var(--green-br)', color: 'var(--green)' }}>
                  <Icon name="checkCircle" size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                  If an account exists for {email}, a reset link is on its way.
                </div>
              )}

              <div className="form-group">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  autoComplete="username"
                  inputMode="email"
                  aria-invalid={error ? 'true' : undefined}
                />
              </div>

              <div className="form-group">
                <div className="login-label-row">
                  <label htmlFor="login-password">Password</label>
                  <a href="#" className="login-forgot" onClick={handleForgotPassword}>Forgot your password?</a>
                </div>
                <div className="input-affix">
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    aria-invalid={error ? 'true' : undefined}
                  />
                  <button
                    type="button"
                    className="input-affix-btn"
                    onClick={() => setShowPw(s => !s)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    aria-pressed={showPw}
                  >
                    <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
                  </button>
                </div>
              </div>

              <button className="btn btn-gold login-submit" type="submit" disabled={loading}>
                {loading
                  ? <><Icon name="loader" size={15} className="spin" /> Signing in&hellip;</>
                  : 'Login'}
              </button>

              <p className="login-footer-text">
                Trouble getting in? Ask whoever set up your account.
              </p>
            </div>
          </form>

          {/* ── Right: decorative panel ── */}
          <div className="login-image-side">
            <div className="login-image-content">
              <div className="login-image-pole" />
              <div className="login-image-brand">
                <span className="login-image-name">{BRAND.name}</span>
                <span className="login-image-sub">Staff Dashboard</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
