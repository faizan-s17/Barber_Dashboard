import { useEffect, useState } from 'react'

let pushToast = () => {}

export const toast = {
  success: msg => pushToast(msg, 'success'),
  error: msg => pushToast(msg, 'error'),
}

export function ToastHost() {
  const [items, setItems] = useState([])

  useEffect(() => {
    pushToast = (msg, kind) => {
      const id = Math.random().toString(36).slice(2)
      setItems(list => [...list, { id, msg, kind }])
      setTimeout(() => setItems(list => list.filter(i => i.id !== id)), 3500)
    }
    return () => { pushToast = () => {} }
  }, [])

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(i => (
        <div key={i.id} className="cc-toast" style={i.kind === 'error' ? { borderColor: 'var(--red-br)', color: 'var(--red)' } : {}}>
          {i.msg}
        </div>
      ))}
    </div>
  )
}
