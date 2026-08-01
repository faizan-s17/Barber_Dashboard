import { useId } from 'react'

export function Checkbox({ id, name, checked, onCheckedChange, disabled, className = '' }) {
  const autoId = useId()
  const inputId = id || autoId

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      className={`checkbox ${className}`}
      onClick={() => onCheckedChange?.(!checked)}
      id={inputId}
      name={name}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l5 5L20 7" />
        </svg>
      )}
    </button>
  )
}
