# SkyWeb Barbers — Staff Dashboard

A mobile-first staff dashboard for barber shop management, powered by React + Supabase. Includes AI receptionist integration via n8n and WhatsApp automation.

## Features

- **Overview** — live stats: today's appointments, revenue, active barbers
- **Calendar** — appointment scheduler with per-barber filtering
- **Services** — manage service menu and pricing
- **Settings**
  - Shop Info — name, address, phone, about
  - Barbers — add/edit/remove staff accounts and roles
  - Opening Hours — set open/closed times per day with toggle switches
- Role-based access (Admin vs Barber)
- Mobile-optimised — bottom tab navigation on phones
- Dark theme with gold accent

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Styling | Pure CSS (no UI library) |
| Deployment | Vercel |

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/faizan-s17/Barber_Dashboard.git
cd Barber_Dashboard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set environment variables

Create a `.env` file in the root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Find these in your Supabase project → **Settings → API**.

### 4. Run locally

```bash
npm run dev
```

## Supabase Tables Required

| Table | Purpose |
|---|---|
| `barbers` | Staff profiles and roles |
| `shop_config` | Shop name, address, opening hours |
| `appointments` | Bookings with date, time, service, barber |
| `services` | Service name and price list |

## Deployment (Vercel)

1. Import this repo on [vercel.com](https://vercel.com)
2. Framework: **Vite** (auto-detected)
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Login

Staff must be invited via Supabase Auth (Authentication → Users → Invite user). Their email must also exist in the `barbers` table — the dashboard links the auth user to the barber profile automatically on first sign-in.
