export function Alert({ children, variant = 'default', className = '', style }) {
  return (
    <div className={`alert alert-${variant} ${className}`} role="alert" style={style}>
      {children}
    </div>
  )
}

export function AlertTitle({ children }) {
  return <div className="alert-title">{children}</div>
}

export function AlertDescription({ children }) {
  return <div className="alert-desc">{children}</div>
}
