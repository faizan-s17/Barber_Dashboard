// Pre-auth branding. Used by the login screen and as the fallback everywhere else.
//
// Nothing in src/ should ever hardcode a shop name again — see BARBER_V2_PLAN.md §4.
// Post-login the real values come from the `shop_config` row via ShopContext; this file
// only covers the screens that render before a session exists (and so cannot read the DB).
//
// To rebrand for a client, set these in .env.local — no code change:
//   VITE_SHOP_NAME="Sharp Cuts Barbers"
//   VITE_SHOP_LOGO="https://…/logo.png"

export const BRAND = {
  name: import.meta.env.VITE_SHOP_NAME || 'Barbershop',
  logoUrl: import.meta.env.VITE_SHOP_LOGO || '',
  subtitle: import.meta.env.VITE_SHOP_SUBTITLE || 'Admin Dashboard',
}
