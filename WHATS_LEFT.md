# What's Left — Barber Receptionist

Working checklist as of **2026-07-27**. Localisation (currency, date formats, region) is
tracked separately and deliberately excluded here.

Workflow: `HOnNWmj5EO2XvEm6` · 118 nodes · Supabase `eatpsykqvqtncdrvsqnc`

---

## 🔴 1. Blocked on ONE thing — the `service_role` credential

Everything in this section unblocks the moment a **Custom Auth** credential named
`Supabase service_role` exists in n8n:

```json
{"headers":{"apikey":"YOUR_SERVICE_ROLE_KEY","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}}
```

*(Custom Auth, not Header Auth — Supabase needs both headers. Key from Supabase → Project
Settings → API Keys → `service_role`.)*

| # | Task | Why it matters |
|---|---|---|
| 1.1 | Repoint **9 Supabase HTTP nodes** off the anon key | Clears all 22 `HARDCODED_CREDENTIALS` warnings; the anon key is currently in plaintext in the workflow JSON |
| 1.2 | **Lock down `appointments`** (migration `000` second half) | Last piece of the security hole — anon can currently read *and delete* the appointment book |
| 1.3 | Revoke anon on `get_shop_data()` / `is_admin()` | Both are `security definer` and anon-executable |
| 1.4 | Restrict `services` / `barbers` blanket-true write policies | Any logged-in barber can currently edit prices and delete colleagues |
| 1.5 | **Waitlist claim page** — `GET /barber-claim/:token` | The waiting list is fully built and tested in the database but has no way for a customer to claim |
| 1.6 | **Offer expiry schedule** — `expire_stale_offers()` every 5 min | Unclaimed offers currently never expire |
| 1.7 | **Outbox drain worker** | Waitlist SMS are queued but nothing sends them |
| 1.8 | **Call-ended webhook** → `call_logs` | The Usage page reads **zero** until this exists |

**Estimate once unblocked:** 2–3 days for all eight.

---

## 🟠 2. Blocked on Twilio

| # | Task | Notes |
|---|---|---|
| 2.1 | **A2P 10DLC registration** (Brand + Campaign) | **Longest lead time of anything remaining — days to weeks.** Start it first; US carriers filter unregistered long-code traffic |
| 2.2 | Upgrade off trial | Removes the *"Sent from your Twilio trial account"* prefix and the verified-numbers-only limit |
| 2.3 | Waitlist SMS templates (offer / won / lost) | Also needs 1.7 above |

Four customer SMS templates are **already live and proven**: booking confirmed, rescheduled,
cancelled, 24h reminder.

---

## 🟡 3. Not blocked — the real work

### 3.1 Finish Phase 1: move the booking path off Google Calendar ⭐

**The highest-value item left.** `barber_free_slots()` exists, is tested, and is used by the
alternatives ladder — but the **main booking path still reads Google Calendar** and parses
barber names out of event descriptions.

That parsing is where defect D1 came from, and it was found in **three separate nodes**.
Moving availability to Postgres deletes the entire class of bug rather than patching it a
fourth time, and removes the duplicated phone-normalisation shims in the SMS nodes.

Touches: `Check Slot + Alternatives`, `Find Soonest Slot`, `Check Reschedule Slot`,
`Find Booking To Cancel`, `Find Booking To Reschedule`.

### 3.2 Booking-ID lookup, cancel and reschedule ⭐

**The AI currently issues a booking reference it cannot accept back.** It reads out
`W4X4WW` on the call, but `Search Booking To Cancel` / `Search Booking To Reschedule` still
search Google Calendar by phone number only.

A customer who rings and reads out their reference cannot be found by it. That is worse
than not issuing one. Naturally solved alongside 3.1.

### 3.3 Apply the Dograh prompts

`DOGRAH_PROMPTS.md` is written and ready to paste — four node prompts plus the tool-schema
additions (`booking_id`, `join_waitlist`, waitlist window params).

**One open decision:** the Global Node currently discloses that Jamie is an AI. Delete the
`[DISCLOSURE]` line if you'd rather it didn't.

### 3.4 Error workflow + monitoring

No error workflow is attached. No alerting on booking failures, webhook downtime, dead
outbox letters, or usage thresholds. Runbook procedures exist; the automation doesn't.

### 3.5 Dashboard odds and ends

- "Needs attention" list for phone numbers that failed normalisation
- Manual "offer this slot to the waiting list" button on an empty Calendar slot

---

## 🔵 4. Needs you — infrastructure

| # | Task | Risk if skipped |
|---|---|---|
| 4.1 | **n8n persistence** (Postgres or a volume at `/home/node/.n8n`) | **Any redeploy wipes every workflow change made so far.** Still the single biggest risk |
| 4.2 | Auto-updates **off**, pin the image tag | An unattended n8n update triggers 4.1 with nobody touching anything |
| 4.3 | Confirm Serverless / app-sleeping is **off** | Cold start = first caller waits, voice agent times out |
| 4.4 | Railway credit | Was $4.33 / 26 days. If it runs out the phone stops being answered |
| 4.5 | **`TZ` / `GENERIC_TIMEZONE` did not apply** | Live run showed the host at **`+04:00`**. Only nodes calling `.setZone()` render correctly; the rest are exposed to defect D3 |
| 4.6 | Enable leaked-password protection | Supabase Auth setting, one toggle |
| 4.7 | Dedicated shop Google Calendar (**D2**) | Currently a personal Gmail; personal events pollute availability |
| 4.8 | Re-import Dental (125 nodes) + LinkedIn (23 nodes) | Lost in the wipe; JSONs are in Downloads |

---

## 🟣 5. Needs you — data

| # | Task | Notes |
|---|---|---|
| 5.1 | **Real `Haircut` price** | Currently **£100**, attached to 9 real bookings, and now appearing in customer-facing confirmations |
| 5.2 | Trailing space in shop name | `"SkyWeb Barbers "` — visible in every SMS and email |
| 5.3 | Real trading hours | Tue/Wed were set to 19:00 as a placeholder |
| 5.4 | **Who Does What matrix** | Seeded as everyone-does-everything. Until corrected the AI can offer a colour to a clippers-only barber. Settings → Who Does What |
| 5.5 | Real service menu | Durations and clean-up buffers |

---

## ⚫ 6. Separate but serious

**Dental + physio tables have the same non-enforcing RLS** — 18 tables including
`dental_patients`, `dental_call_logs`, `physio_call_logs`, `physio_red_flag_logs`. Those
hold patient names, phone numbers, transcripts and clinical triage records.

More serious than the barber case was. Needs its own audit, and the **same ordering trap
applies**: check whether those n8n workflows depend on the anon key *before* revoking
anything, or you take them offline.

---

## Suggested order

1. **4.1 n8n persistence** — protects everything already built
2. **2.1 A2P 10DLC** — longest lead time, start it in parallel
3. **1.x service_role credential** — unblocks eight tasks at once
4. **3.1 + 3.2** — Postgres availability and booking-ID lookup, together
5. **5.x data** — quick, and 5.1/5.4 are customer-visible today
6. **3.3 prompts**, then **3.4 monitoring** before any client sees it

---

## Already done (for reference)

Booking IDs · overlap constraint (double-booking impossible) · E.164 normalisation +
triggers · availability engine · alternatives ladder · waiting list (database, race-tested)
· call-logging schema · usage packages · notification outbox · Phase 3 inverted booking
order · 4 live SMS templates · white-labelled dashboard with Usage / Waiting List /
Who Does What / Plan & Usage · defects **D1, D3 (partial), D4, D14** closed and
sweep-verified · onboarding checklist and two runbooks.
