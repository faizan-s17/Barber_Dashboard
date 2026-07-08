import { useState } from 'react'
import ShopSettings from './ShopSettings'
import Barbers from './Barbers'
import OpeningHours from './OpeningHours'

const TABS = [
  { id: 'shop',    label: 'Shop Info' },
  { id: 'barbers', label: 'Barbers' },
  { id: 'hours',   label: 'Opening Hours' },
]

export default function SettingsHub({ isAdmin }) {
  const [tab, setTab] = useState('shop')
  return (
    <>
      <div className="topbar">
        <h1>Settings</h1>
        <div className="topbar-sub">Shop information · team members · opening hours</div>
      </div>
      <div className="sub-nav">
        {TABS.map(t => (
          <button key={t.id} className={`sub-nav-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="embedded-page">
        {tab === 'shop'    && <ShopSettings isAdmin={isAdmin} />}
        {tab === 'barbers' && <Barbers isAdmin={isAdmin} />}
        {tab === 'hours'   && <OpeningHours isAdmin={isAdmin} />}
      </div>
    </>
  )
}
