import { useState, useCallback, useEffect } from 'react'

let _addToast = null
export const toast = {
  success: (msg) => _addToast?.({ msg, type: 'success' }),
  error:   (msg) => _addToast?.({ msg, type: 'error' }),
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  const add = useCallback((t) => {
    const id = Date.now()
    setToasts(p => [...p, { ...t, id }])
    setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 3500)
  }, [])

  useEffect(() => { _addToast = add; return () => { _addToast = null } }, [add])

  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span>{t.type === 'success' ? '✓' : '×'}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
