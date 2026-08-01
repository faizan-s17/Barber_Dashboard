import { useState, useRef, useCallback, useEffect } from 'react'

export function Tooltip({ children }) {
  return <div className="tooltip-wrap">{children}</div>
}

export function TooltipTrigger({ render, children }) {
  return render || children
}

export function TooltipContent({ children }) {
  return <div className="tooltip-bubble" role="tooltip">{children}</div>
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>
}
