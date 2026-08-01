import { useEffect, useRef, useId } from 'react'
import Icon from './Icon'

/**
 * Accessible dialog.
 *
 * Covers the rules the inline modals were missing:
 *   escape-routes   — Escape closes, and there's always a visible close control
 *   focus-management— focus moves into the dialog, is trapped, and returns to
 *                     whatever opened it on close
 *   modal-escape    — overlay click dismisses
 *   voiceover-sr    — role="dialog" + aria-modal + aria-labelledby
 *   scroll lock     — background can't scroll underneath
 *
 * `confirmClose` guards against losing unsaved work (sheet-dismiss-confirm).
 */
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  confirmClose = false,
  confirmMessage = 'Discard your changes?',
  labelledBy,
}) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)
  const autoId = useId()
  const titleId = labelledBy || `modal-title-${autoId}`

  function requestClose() {
    if (confirmClose && !window.confirm(confirmMessage)) return
    onClose?.()
  }

  useEffect(() => {
    if (!open) return

    // remember what had focus so we can hand it back
    restoreRef.current = document.activeElement

    // move focus into the dialog — first field, else the panel itself
    const panel = panelRef.current
    const first = panel?.querySelector(FOCUSABLE)
    ;(first || panel)?.focus()

    // lock background scroll without the layout jumping as the bar disappears
    const prevOverflow = document.body.style.overflow
    const prevPad = document.body.style.paddingRight
    const gap = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px`

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); return }
      if (e.key !== 'Tab') return

      const nodes = [...(panel?.querySelectorAll(FOCUSABLE) || [])]
        .filter(n => n.offsetParent !== null)
      if (!nodes.length) { e.preventDefault(); return }

      const firstNode = nodes[0]
      const lastNode = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault(); lastNode.focus()
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault(); firstNode.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPad
      // hand focus back to the trigger
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) requestClose() }}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" onClick={requestClose} aria-label="Close dialog">
            <Icon name="xMark" size={16} />
          </button>
        </div>

        {children}

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
