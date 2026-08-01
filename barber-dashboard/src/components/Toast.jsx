import { useState, useCallback, useEffect, useRef } from 'react'
import Icon from './Icon'

let _addToast = null
let _updateToast = null

export const toast = {
  success: (msg) => _addToast?.({ msg, type: 'success' }),
  error:   (msg) => _addToast?.({ msg, type: 'error' }),

  promise(promise, { loading, success, error }) {
    const id = _addToast?.({ msg: loading, type: 'loading' })
    if (!id) return promise
    promise.then(
      (data) => {
        const msg = typeof success === 'function' ? success(data) : success
        _updateToast?.(id, { msg, type: 'success' })
      },
      (err) => {
        const msg = typeof error === 'function' ? error(err) : error
        _updateToast?.(id, { msg, type: 'error' })
      }
    )
    return promise
  },
}

const ICON = { success: 'checkCircle', error: 'alert', loading: 'loader' }
const COLOR = { success: 'var(--green)', error: 'var(--red)', loading: 'var(--text-muted)' }

export function ToastContainer() {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)
  const timers = useRef(new Map())

  const remove = useCallback(id => {
    setToasts(p => p.filter(x => x.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const startTimer = useCallback((id, ms = 4000) => {
    const prev = timers.current.get(id)
    if (prev) clearTimeout(prev)
    timers.current.set(id, setTimeout(() => remove(id), ms))
  }, [remove])

  const add = useCallback((t) => {
    const id = ++seq.current
    setToasts(p => [...p, { ...t, id }])
    if (t.type !== 'loading') startTimer(id)
    return id
  }, [startTimer])

  const update = useCallback((id, patch) => {
    setToasts(p => p.map(x => x.id === id ? { ...x, ...patch } : x))
    startTimer(id)
  }, [startTimer])

  useEffect(() => {
    _addToast = add
    _updateToast = update
    return () => { _addToast = null; _updateToast = null }
  }, [add, update])

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear() }, [])

  return (
    <div
      className="toast-container"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <Icon
            name={ICON[t.type] || 'checkCircle'}
            size={16}
            className={t.type === 'loading' ? 'spin' : ''}
            style={{ color: COLOR[t.type] || 'var(--green)' }}
          />
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button
            className="toast-close"
            onClick={() => remove(t.id)}
            aria-label="Dismiss notification"
          >
            <Icon name="xMark" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
