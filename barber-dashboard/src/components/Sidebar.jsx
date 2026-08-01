import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { toast } from './Toast'
import { useBranding } from '../ShopContext'
import Icon from './Icon'

// `primary: true` = shown in the mobile bottom bar.
// The skill caps bottom navigation at 5 items; we surface 4 + "More" so the
// remaining destinations stay reachable rather than being scrolled off-screen.
//
// `operatorOnly` = SkyWeb's own diagnostics. A barber has no use for connection
// health or webhook status, and putting it in their nav just adds noise and makes
// the product feel like someone else's admin panel.
const NAV = [
  { id: 'overview', label: 'Today',        icon: 'home',      primary: true,  group: 'Shop' },
  { id: 'calendar', label: 'Diary',        icon: 'calendar',  primary: true,  group: 'Shop' },
  { id: 'clients',  label: 'Customers',    icon: 'user',      primary: true,  group: 'Shop' },
  { id: 'waitlist', label: 'Waiting List', icon: 'hourglass', primary: true,  group: 'Shop' },
  { id: 'calls',    label: 'Phone Calls',  icon: 'phone',     primary: false, group: 'Shop' },
  { id: 'services', label: 'Price List',   icon: 'scissors',  primary: false, group: 'Manage' },
  { id: 'settings', label: 'Settings',     icon: 'sliders',   primary: false, group: 'Manage' },
  { id: 'usage',    label: 'My Plan',      icon: 'gauge',     primary: false, group: 'Manage' },
  { id: 'health',   label: 'System Health', icon: 'activity', primary: false, group: 'SkyWeb', operatorOnly: true },
  { id: 'shops',    label: 'Barber Shops', icon: 'store',     primary: false, group: 'SkyWeb', operatorOnly: true },
]

const GROUPS = ['Shop', 'Manage', 'SkyWeb']

function NavButton({ item, active, onSelect }) {
  return (
    <button
      type="button"
      className="nav-item"
      data-primary={item.primary}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(item.id)}
    >
      <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
      <span>{item.label}</span>
    </button>
  )
}

export default function Sidebar({ page, setPage, profile }) {
  const initials = profile?.name ? profile.name.charAt(0).toUpperCase() : '?'
  const brand = useBranding()
  const [moreOpen, setMoreOpen] = useState(false)

  const isOperator = profile?.role === 'operator'
  const visible = NAV.filter(n => !n.operatorOnly || isOperator)

  // Escape closes the More sheet — the skill's `modal-escape` / `escape-routes` rule
  useEffect(() => {
    if (!moreOpen) return
    const onKey = e => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  function select(id) { setPage(id); setMoreOpen(false) }

  async function logout() {
    await supabase.auth.signOut()
    toast.success('Signed out')
  }

  const secondary = visible.filter(n => !n.primary)
  const groups = GROUPS.filter(g => visible.some(n => n.group === g))

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="barber-pole" aria-hidden="true" />
          {brand.logoUrl && <img src={brand.logoUrl} alt="" />}
          <div className="sidebar-brand-text">
            <strong>{brand.name}</strong>
            <span>{brand.subtitle}</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {groups.map(group => (
            <div key={group} className="nav-group">
              <div className="nav-section-label" aria-hidden="true">{group}</div>
              {visible.filter(n => n.group === group).map(item => (
                <NavButton key={item.id} item={item} active={page === item.id} onSelect={select} />
              ))}
            </div>
          ))}

          {/* Mobile only — opens the remaining destinations */}
          <button
            type="button"
            className="nav-item nav-more"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
          >
            <span className="nav-icon"><Icon name="dots" size={18} /></span>
            <span>More</span>
          </button>
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-avatar" aria-hidden="true">{initials}</div>
          <div className="sidebar-user-info">
            <strong>{profile?.name || 'Barber'}</strong>
            <span>{profile?.role === 'admin' ? 'Admin' : 'Barber'}</span>
          </div>
          <button className="logout-btn" onClick={logout} aria-label="Sign out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      {moreOpen && (
        <div className="more-overlay" onClick={() => setMoreOpen(false)}>
          <div
            className="more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More destinations"
            onClick={e => e.stopPropagation()}
          >
            <div className="more-handle" aria-hidden="true" />
            <div className="more-grid">
              {secondary.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="more-item"
                  aria-current={page === item.id ? 'page' : undefined}
                  onClick={() => select(item.id)}
                >
                  <Icon name={item.icon} size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="more-divider" />

            <div className="more-row">
              {/* destructive action kept visually separated from navigation */}
              <button className="btn btn-danger" onClick={logout} style={{ flex: 1 }}>
                <Icon name="logout" size={16} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
