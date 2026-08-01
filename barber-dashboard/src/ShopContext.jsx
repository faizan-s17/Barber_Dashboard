import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { BRAND } from './brand'

// Single source of truth for shop identity across the dashboard.
// Everything reads from `shop_config` so a new client is a config row, not a code change.
const ShopContext = createContext({ shop: null, loading: true, refresh: () => {} })

export function ShopProvider({ children }) {
  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('shop_config').select('*').limit(1).single()
    setShop(data || null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // keep the browser tab title in step with the shop, so nothing is hardcoded in index.html
  useEffect(() => {
    const name = shop?.name || BRAND.name
    if (name) document.title = `${name} — Dashboard`
  }, [shop])

  return (
    <ShopContext.Provider value={{ shop, loading, refresh: load }}>
      {children}
    </ShopContext.Provider>
  )
}

export function useShop() {
  return useContext(ShopContext)
}

// Name/logo with a safe fallback chain: DB -> build-time env -> generic.
// Deliberately never falls back to another business's name — a config read failure
// must not make a client's dashboard silently claim to be someone else (plan defect D4).
export function useBranding() {
  const { shop } = useShop()
  return {
    name: shop?.name || BRAND.name,
    logoUrl: shop?.logo_url || BRAND.logoUrl,
    subtitle: BRAND.subtitle,
  }
}
