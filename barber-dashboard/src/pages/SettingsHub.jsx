import { useState } from 'react'
import ShopSettings from './ShopSettings'
import Barbers from './Barbers'
import OpeningHours from './OpeningHours'
import PackageSettings from './PackageSettings'
import BarberServices from './BarberServices'

const TABS = [
  { id: 'shop',     label: 'Shop Details' },
  { id: 'barbers',  label: 'Your Team' },
  { id: 'whodoes',  label: 'Who Does What' },
  { id: 'hours',    label: 'Opening Hours' },
  { id: 'package',  label: 'Plan' },
]

export default function SettingsHub({ isAdmin, isOperator }) {
  const [tab, setTab] = useState('shop')
  return (
    <>
      <div className="topbar">
        <h1>Settings</h1>
        <div className="topbar-sub">Your shop details, team, hours and plan</div>
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
        {tab === 'whodoes' && <BarberServices isAdmin={isAdmin} />}
        {tab === 'package' && <PackageSettings isOperator={isOperator} />}
      </div>
    </>
  )
}
