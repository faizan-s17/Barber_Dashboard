import { supabase } from '../supabase'
import { toast } from './Toast'
import Icon from './Icon'

const NAV = [
  { id: 'overview',  label: 'Overview',  icon: 'home' },
  { id: 'calendar',  label: 'Calendar',  icon: 'calendar' },
  { id: 'clients',   label: 'Clients',   icon: 'user' },
  { id: 'calls',     label: 'Calls',     icon: 'phone' },
  { id: 'services',  label: 'Services',  icon: 'scissors' },
  { id: 'health',    label: 'AI Health', icon: 'activity' },
  { id: 'settings',  label: 'Settings',  icon: 'sliders' },
]

export default function Sidebar({ page, setPage, profile, theme, toggleTheme }) {
  const initials = profile?.name ? profile.name.charAt(0).toUpperCase() : '?'

  async function logout() {
    await supabase.auth.signOut()
    toast.success('Signed out')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="https://theskyweb-portfolio.vercel.app/assets/skyweb-logo-network-CqQKEOUL.png" alt="logo" />
        <div className="sidebar-brand-text">
          <strong>SkyWeb Barbers Co</strong>
          <span>Admin Dashboard</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {NAV.map(n => (
          <div
            key={n.id}
            className={`nav-item ${page === n.id ? 'active' : ''}`}
            onClick={() => setPage(n.id)}
          >
            <span className="nav-icon"><Icon name={n.icon} size={16} /></span>
            {n.label}
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <strong>{profile?.name || 'Barber'}</strong>
          <span>{profile?.role === 'admin' ? 'Admin' : 'Barber'}</span>
        </div>
        <button className="theme-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        <button className="logout-btn" onClick={logout} title="Sign out">
          <Icon name="logout" size={16} />
        </button>
      </div>
    </aside>
  )
}
