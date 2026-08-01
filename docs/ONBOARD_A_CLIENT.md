# Onboarding a New Barber Shop

The whole point of the white-labelling work is that a new client should be **config, not code**.
Work top to bottom. Nothing here requires editing `src/`.

**Realistic timing:** half a day if you have the client's details to hand. The slow parts are
Google OAuth verification and waiting for them to send you their real service menu.

---

## Before you start — what to ask the client for

Send this list the moment they sign. Everything else waits on it.

1. Trading name, exactly as they want it spoken on the phone
2. Address, phone number, and a contact email for booking notifications
3. Logo (PNG, square-ish, transparent background if possible)
4. **Service menu**: name, price, how long each takes, and clean-up time between clients
5. **Which barber does which service** — do not guess this
6. Barbers: name, email, and whether they're an admin
7. Opening hours per day, including any lunch break and how bank holidays work
8. Cancellation policy, payment methods, parking notes
9. Whether they're happy for calls to be recorded

---

## 1. Infrastructure

- [ ] **Supabase project.** Region **eu-west-2 (London)** for a UK client. This is immutable
      after creation — getting it wrong means a migration later. (The existing SkyWeb project
      is in Tokyo; see plan §11.4.)
- [ ] Run every migration in order (see `BARBER_V2_PLAN.md` §5 and the applied list).
- [ ] **Verify RLS before any real data lands.** With only the anon key:
      `clients` must return 0 rows and `DELETE` on `appointments` must fail.
- [ ] Enable leaked-password protection in Auth settings.
- [ ] **n8n persistence.** Postgres via `DB_*` vars, or a volume at `/home/node/.n8n`.
      Without this, a redeploy wipes every workflow and credential. This is not optional.
- [ ] Set `N8N_ENCRYPTION_KEY` **before** creating any credential. Never rotate it.
- [ ] Set `N8N_EDITOR_BASE_URL` and `WEBHOOK_URL` **with the `https://` scheme** — omitting
      it produces a confusing Google OAuth `invalid_request` failure.
- [ ] Set `GENERIC_TIMEZONE` and `TZ` to `Europe/London`.
- [ ] Turn **auto-updates off** and pin the n8n image tag.
- [ ] Confirm **Serverless / app-sleeping is OFF** — a cold start means the first caller
      after a quiet period waits, and the voice agent times out.

## 2. Google

- [ ] **A dedicated calendar for the shop.** Not anyone's personal account, and with no
      subscribed holiday or birthday calendars. Personal events on a shared calendar cause
      real availability bugs.
- [ ] OAuth client (Web application type) with redirect URI:
      `https://<your-n8n-host>/rest/oauth2-credential/callback`
- [ ] Enable **Gmail API**, **Google Calendar API**, **Google Sheets API**.
- [ ] Consent screen in **Testing**, with the shop's Google account as a test user.
- [ ] Create three n8n credentials — Gmail, Calendar, Sheets — same client ID and secret.
- [ ] Attach them to all 31 Google nodes **via the API, not the UI** (the UI strips
      `resource`/`operation` discriminators). Then re-check those values.

## 3. Shop data

Everything below is a row in Supabase or a field in the dashboard. No code changes.

- [ ] `shop_config`: name, address, phone, `shop_email`, `logo_url`, hours text,
      cancellation policy, payment methods, parking
- [ ] `shop_config.open_hours` — real trading hours per day (Settings → Opening Hours)
- [ ] `barbers` — one row each, with emails; mark the owner as `admin`
- [ ] `services` — name, price, `duration_minutes`, `buffer_minutes`
- [ ] **Settings → Who Does What** — untick anything a barber doesn't actually do.
      Shipped as everyone-does-everything; leaving it that way means the AI will offer
      services to barbers who can't perform them.
- [ ] `usage_packages` — the plan you're selling them (Settings → Plan & Usage)
- [ ] Upload the logo to Supabase Storage and put the URL in `shop_config.logo_url`.
      **Do not hotlink it from your own site** — your redeploy becomes their outage.

## 4. Dashboard

- [ ] `.env.local` from `.env.example`:
      `VITE_SHOP_NAME`, `VITE_SHOP_SUBTITLE`, `VITE_SHOP_LOGO`
      (these cover the login screen only; everything post-login reads `shop_config`)
- [ ] Deploy
- [ ] Create staff logins and link each `barbers.user_id` to the auth user
- [ ] Confirm a non-admin barber cannot edit services or other barbers
- [ ] **Set roles correctly** — this decides what the client even sees:

| Role | Who | Sees |
|---|---|---|
| `barber` | shop staff | day-to-day pages, read-only settings |
| `admin` | shop owner | + edit team, services, hours, shop details |
| `operator` | **SkyWeb only** | + System Health, and can edit the plan |

Give yourself **one `operator` account** on the client's instance. Diagnostics
(connection status, webhook health, automation events) and the plan editor are hidden
from everyone else — a barber has no use for them, and shouldn't be able to change the
allowance they're billed against.

A shop admin **cannot** promote themselves to operator; the `barbers_no_self_promote`
RLS policy blocks it.

## 5. Voice agent

- [ ] Copy the four node prompts from `DOGRAH_PROMPTS.md`
- [ ] Decide the AI-disclosure line (see the note at the top of that file)
- [ ] Point the tool at `https://<n8n-host>/webhook/<id>/skyweb-barber-basic`
- [ ] Point the shop-data tool at `.../barber-shop-data`
- [ ] Add the recording announcement to the greeting **if** recording is enabled

## 6. Go-live tests — do all of these on a real call

- [ ] Book an appointment; confirm the reference is read back and it lands in both
      Supabase and the calendar
- [ ] Ask for a barber who is fully booked → confirm the alternative offer is sensible
- [ ] Cancel using only the reference
- [ ] Cancel without the reference (say you've lost it) → confirm it still works
- [ ] Ask for something outside opening hours
- [ ] Ask for a human
- [ ] Say nothing for ten seconds
- [ ] Put an unrelated event on the shop calendar → confirm the shop does **not** report
      itself fully booked
- [ ] Check the dashboard shows all of the above

---

## Not ready yet — do not sell these

As of 2026-07-27 these are built in the database but **not wired end to end**:

| Feature | State |
|---|---|
| **SMS** | Outbox table exists; no Twilio account, no sender. The AI's waiting-list wording says "I'll text you" — change it or hold the feature back. |
| **Waiting list** | Database complete and tested; the n8n claim page and expiry schedule are not built. |
| **Call logging / minutes** | Schema and Usage page ready; nothing writes to `call_logs` yet, so it will read zero. |

All three are blocked on the same thing: a `service_role` credential in n8n.
