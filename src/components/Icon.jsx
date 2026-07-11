const PATHS = {
  home:       <path d="M3 11.5L12 3l9 8.5V21a1 1 0 0 1-1 1h-5v-5h-6v5H4a1 1 0 0 1-1-1z" />,
  calendar:   <><rect x="3.5" y="4.5" width="17" height="16" rx="2" /><path d="M8 3v3M16 3v3M3.5 9h17" /></>,
  scissors:   <><path d="M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /><path d="M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /><path d="M8.6 5.4L21 18M21 6L8.6 18.6" /></>,
  user:       <><circle cx="12" cy="8.5" r="3.7" /><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" /></>,
  sliders:    <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="none" /><circle cx="15" cy="12" r="2" fill="none" /><circle cx="9" cy="18" r="2" fill="none" /></>,
  clock:      <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3 1.5" /></>,
  tag:        <><path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9z" /><circle cx="7.5" cy="7.5" r="1.4" /></>,
  pin:        <><path d="M12 21s6.5-5.5 6.5-10a6.5 6.5 0 0 0-13 0c0 4.5 6.5 10 6.5 10z" /><circle cx="12" cy="11" r="2.3" /></>,
  clipboard:  <><rect x="5" y="5" width="14" height="15" rx="2" /><rect x="9" y="3" width="6" height="3.5" rx="1" /><path d="M8.5 11h7M8.5 14.5h4" /></>,
  key:        <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3" /><path d="M16 7l3 3M14.5 8.5l2.5 2.5" /></>,
  phone:      <path d="M21 16.5v2.6a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.7-2.8 17.4 17.4 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3.1 5a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.5c.1.8.3 1.6.6 2.3a1.8 1.8 0 0 1-.4 1.9l-1.1 1.1a14.4 14.4 0 0 0 5.4 5.4l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.7.3 1.5.5 2.3.6a1.8 1.8 0 0 1 1.5 1.8z" />,
  activity:   <path d="M3 12h4l2.5 7 5-14 2.5 7H21" />,
  check:      <path d="M5 12.5l4.5 4.5L19 6.5" />,
  xMark:      <path d="M6 6l12 12M18 6L6 18" />,
  loader:     <><circle cx="12" cy="12" r="8" opacity="0.25" /><path d="M20 12a8 8 0 0 0-8-8" /></>,
  logout:     <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  chevronLeft:  <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  sun:  <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  refresh: <path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" />,
  checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></>,
  xCircle:     <><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>,
  alert:       <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>,
  bell:        <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></>,
  inbox:       <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  swap:        <><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></>,
}

export default function Icon({ name, size = 16, className = '', style, strokeWidth = 1.7 }) {
  const children = PATHS[name]
  if (!children) return null
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, verticalAlign: '-0.18em', ...style }}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const ScissorsMark = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    <path d="M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    <path d="M8.6 5.4L21 18M21 6L8.6 18.6" />
  </svg>
)
