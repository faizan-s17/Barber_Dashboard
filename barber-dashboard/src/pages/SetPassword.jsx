import { useRef, useState } from 'react'
import { supabase } from '../supabase'
import { BRAND } from '../brand'
import Icon from '../components/Icon'

// Shown when the session came from an invite or password-recovery link.
// Supabase logs the user in automatically via the token in the URL, but
// never prompts them to actually set a password -- without this screen,
// an invited admin is signed in with no password on their account at all,
// and can't log back in once they sign out.
export default function SetPassword({ mode, onDone }) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const pwRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      pwRef.current?.focus()
      return
    }
    if (password !== confirm) {
      setError('Passwords don’t match.')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    onDone()
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card-split">
          <form className="login-form-side" onSubmit={handleSubmit}>
            <div className="login-form-inner">
              <div className="login-heading">
                {BRAND.logoUrl && <img src={BRAND.logoUrl} alt="" className="login-brand-logo" />}
                <h1>{mode === 'recovery' ? 'Reset your password' : 'Welcome to ' + BRAND.name}</h1>
                <p>{mode === 'recovery' ? 'Choose a new password for your account' : 'Set a password to finish setting up your account'}</p>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <Icon name="alert" size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                  {error}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="new-password">New password</label>
                <div className="input-affix">
                  <input
                    id="new-password"
                    ref={pwRef}
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    autoFocus
                    autoComplete="new-password"
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

              <div className="form-group">
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Type it again"
                  required
                  autoComplete="new-password"
                />
              </div>

              <button className="btn btn-gold login-submit" type="submit" disabled={loading}>
                {loading
                  ? <><Icon name="loader" size={15} className="spin" /> Saving&hellip;</>
                  : 'Set password & continue'}
              </button>
            </div>
          </form>

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
