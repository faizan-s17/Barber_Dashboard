# SkyWeb Barber Receptionist — V2 Launch Plan
**Waiting list · Barber-full fallback · Booking IDs · Call transparency · SMS · Usage & minutes**

| | |
|---|---|
| Version | 2.0 — complete, launch-grade |
| Date | 2026-07-27 |
| Supabase | `ai-receptionist` / `eatpsykqvqtncdrvsqnc` (eu data residency: **no — see §11.4**) |
| Dashboard | `barber-dashboard` (React 19 + Vite, Supabase JS) |
| Voice agent | Dograh — "Barber Shop Receptionist – Appointment Booking - inbound", tool `manage_barber_appointment` |
| n8n | "SkyWeb Barber AI Receptionist - Phase 0-8", **108 nodes** — audited from `Phase 0-8 (2).json`, see §2A |
| Status | v2.1 — live workflow audited. Ready to build. 7 decisions outstanding (§15). 10 inputs needed (§16). |

> **Every SQL object in this document has been executed and tested against the live Postgres 17 instance** in a throwaway schema (`v2check`, created and dropped 2026-07-27). Test results are in §13. Six real defects were found and fixed during that process — they are listed in §13.1 so you can see what "validated" bought us. The scratch schema is gone; the only residue is the `btree_gist` extension, which this plan needs anyway (§5, migration 000).

---

## 1. Executive summary

Six features, built in eight phases over an estimated **17–22 working days**.

The two things that make this a launch plan rather than a feature list:

1. **There is a live security hole that must close before any real client's customers are in this database.** `appointments`, `call_logs` and `clients` currently grant `ALL` (read/insert/update/delete) to the **anonymous** role with `USING(true)`. The anon key is embedded in the dashboard's JavaScript bundle and visible to anyone who opens devtools. Today that means anyone on the internet can read every customer's name, phone and email, and delete your entire appointment book. With a paying client's customer data in there, that is a UK GDPR personal-data breach. This is **Phase 0** and nothing else ships before it. Details and fix in §3.
2. **Google Calendar cannot be the source of truth for a waiting list.** A waiting list requires an atomic "first to confirm wins" claim. The Calendar API will happily accept two bookings in the same slot. Postgres can guarantee it cannot happen — and now does, via a tested `EXCLUDE USING gist` constraint plus a single-statement guarded `UPDATE`. Phase 1 flips availability to Postgres-authoritative and demotes Calendar to a display mirror.

Everything else is ordinary build work.

---

## 2. Verified baseline

Checked directly against the live database and the workflow export before writing anything.

| Area | Reality |
|---|---|
| `appointments` | 32 rows. No `booking_id`. No overlap constraint — **double-booking is currently possible**. |
| `call_logs` | **0 rows.** No `call_id`, `duration_seconds`, `started_at`/`ended_at`, `handled_by`, `recording_url` or `transcript`. |
| The Calls page | Has therefore always displayed zeros. Nothing has ever written to `call_logs`. |
| `clients` | 27 rows of real names/phones/emails, world-readable and world-deletable (§3). |
| `barbers` | Sam, Tony, Faizan — all active. |
| `services` | 14 active. Contains test junk: `trimiing` £20, `Full boday` £600, `Nails` £70, and `Haircut` priced at **£100**. `duration_minutes` is populated; there is **no `buffer_minutes` column**. |
| `shop_config` | Europe/London. Sun closed. **Tue closes 17:58, Wed 17:59** — leftover test edits. |
| Source of truth | Google Calendar. Supabase written by `Sync Booking Create/Update/Cancel` HTTP nodes. |
| Notifications | 12 Gmail nodes. **No SMS anywhere.** |
| Waiting list | Does not exist. (`physio_waiting_list` exists and informed the design.) |
| Hardcoded shop identity | 4 places in the dashboard + a logo hotlinked from `theskyweb-portfolio.vercel.app` (§4). |
| RLS | Enabled on all tables, but **56 policies are `always true`** — enabled-but-not-enforcing. |
| pgcrypto | Installed in schema `extensions`, **not** `public`. This broke a function during testing (§13.1). |
| Auth | Leaked-password protection **disabled**. |

---

## 2A. Live workflow audit (2026-07-27, `Phase 0-8 (2).json`, 108 nodes)

Read against the actual export Faizan supplied. **The Desktop copy was stale (102 nodes)** — this one has a second webhook branch (`Shop Data Webhook` → `Get Config`/`Get Services`/`Get Staff` → `Format Shop Data`), which is how Dograh pulls shop variables. Item 5 of §16 is now closed.

### 2A.1 What the audit changed in this plan

**1. Phase 0 ordering — this one matters most.**
`Sync Booking Create/Update/Cancel`, `Supabase Overlap Check`, `Fetch Shop Data`, `Get Config/Services/Staff` all authenticate with the **anon key**, inline in the node headers. That means the `anon_write_appointments USING(true)` policy is **load-bearing** — it is the only reason bookings reach Supabase at all. Likewise the anon EXECUTE grant on `get_shop_data()`.

My §3 fix, applied in the order originally written, **would have stopped every booking from syncing and broken the Dograh shop-data feed.** Phase 0 is therefore re-sequenced:

```
0a. Create an n8n "Header Auth" credential holding the SERVICE_ROLE key
0b. Repoint all 8 Supabase HTTP nodes to that credential; delete the inline
    apikey/Authorization header parameters (they are currently in plaintext
    in the workflow JSON, which gets emailed around and sits in Downloads)
0c. Test: one booking end-to-end + one Dograh shop-data fetch
0d. ONLY THEN apply 000_rls_lockdown.sql and revoke anon
0e. Verify with the anon key: clients returns 0 rows, DELETE fails
```
Getting 0d before 0b is a live outage. It is now written as a numbered gate.

**2. Correction to something I told you earlier.** I said `Supabase Overlap Check` "needs a `barber_name` filter added". **That was wrong** — it already filters `barber_name=eq.<assignedBarber>` and performs a correct half-open overlap test (`start_time=lt.<end>`, `end_time=gt.<start>`, `status=neq.cancelled`). The node is sound; leave it alone.

One alignment though: it uses `status != 'cancelled'` while my §5.2 constraint uses `status IN ('confirmed','rescheduled')`. Today those are identical (live data: 25 confirmed, 6 cancelled, 1 rescheduled). They would diverge the moment anyone adds `completed` or `no_show`. **Change the constraint predicate to `WHERE (status <> 'cancelled')`** so the DB guard and the workflow guard can never disagree.

**3. The routing field is `route`, not `intent`.** `Intent Router` switches on `$json.route` across 10 values: `shop_hours`, `shop_location`, `faq`, `request_human`, `book_appointment`, `check_availability`, `lookup_appointment`, `reschedule_appointment`, `cancel_appointment`, `walk_in_today`, plus a `Coming Soon` fallback. Intent *detection* is fuzzy regex inside `Normalize + Validate Request` over `intent + topic`.

So adding `join_waitlist` is three edits, not one: a regex branch in `Normalize + Validate Request`, a rule in `Intent Router`, and a respond node.

**4. Good news: responses are already `respondWith: "json"`.** `Respond - Booked` returns a real object (`{status, message, barber}`). The `options[]` contract in §7 works as specified with no change to the transport. It also confirms Dograh receives structured JSON, which answers half of §16 item 4.

**5. The booking flow has to invert for booking IDs.**
Today: `Create Appointment` (Calendar) → `Sync Booking Create` (Supabase, with `Prefer: return=minimal`, so it returns **nothing**). Since `booking_id` is generated by a database trigger, the workflow currently has no way to learn it — and the AI has to speak it on the call.

New order for Phase 3:
```
1. INSERT into Supabase appointments with Prefer: return=representation
     → returns booking_id, and the EXCLUDE constraint becomes the real gate
2. Create the Google Calendar event (best-effort)
3. PATCH the Supabase row with calendar_event_id
4. Speak the booking_id to the caller
```
This is a better design anyway: the authoritative write happens first, so a Calendar failure can no longer produce a booking that exists in one system and not the other.

**6. Feature B is cheaper than estimated.** `Check Slot + Alternatives` (212 lines) already computes **up to 3 same-day alternative times for the preferred barber**, and already auto-assigns a free barber when no preference is given. Ladder step 2 largely exists. Only step 3 (offer *another* barber at the requested time) and step 4 (scan the next 14 days) are new. **Phase 4 drops from 2–3 days to 1–2.**

### 2A.2 New defects found in the live workflow

**D1 — A single unrecognised calendar event marks the entire shop as fully booked.** In `Check Slot + Alternatives`:
```js
if (evBarber && busyByBarber.hasOwnProperty(evBarber)) {
  busyByBarber[evBarber] = true;
} else if (!evBarber) {
  barbers.forEach(b => { busyByBarber[b] = true; });   // ← all three barbers
}
```
`parseBarberFromEvent` regexes `Barber:\s*([A-Za-z]+)` out of the event description. Any overlapping event **without** that line — and every event not created by this workflow lacks it — blackholes all barbers, and the AI tells the caller the shop is full. Fix: an unattributable event should block **nothing** (or at most be logged for review), never everything. Fold into Phase 1.

**D2 — The calendar is a personal Gmail account.** `Get Events For Day` and every other Calendar node point at **`faizanshahzad2002@gmail.com`**, not `theskyweb.uk@gmail.com` as recorded in my notes. Combined with D1, one personal appointment on that account makes the shop unbookable by phone, and `returnAll: true` means subscribed birthday/holiday calendars come through too. A client launch needs a dedicated shop calendar with nothing else in it. **This is a go-live blocker, not a nicety.**

**D3 — Calendar time windows carry no timezone offset.** `timeMin: "{{ $json.preferredDate }}T00:00:00"` — no `Z`, no `+01:00`. Google resolves that against the calendar's default zone, and the n8n server runs `Asia/Karachi`. That's the same class of bug as the V1 timezone fix, still latent in the day-window query. Phase 1's move to Postgres-authoritative availability (`barber_free_slots`, which builds local wall-clock and converts explicitly — tested at 09:00 in both BST and GMT) removes this whole category rather than patching it.

**D4 — Branding is baked deeper than §4 said.** Beyond the 5 dashboard spots, the shop name and the `theskyweb-portfolio.vercel.app` logo are hardcoded **inside the email HTML in `Check Slot + Alternatives`**. Worse, `Normalize + Validate Request` has hardcoded *fallbacks*:
```js
name: cfg.name || 'SkyWeb Barber Co',
shopEmail: cfg.shop_email || 'theskyweb.uk@gmail.com',
openHours: cfg.open_hours || { 1:['09:00','19:00'], ... }
```
If the Supabase fetch fails, a paying client's AI receptionist quietly introduces itself as **SkyWeb Barber Co**, emails *your* inbox, and uses *your* opening hours. Fallbacks must fail loudly (respond "I'm having trouble, let me take your number") rather than impersonate another business. Phase 0.

**D5 — Email wording is hardcoded in the voice responses.** `Respond - Booked` speaks *"A confirmation email is on its way."* That string and its siblings change with Phase 2. Grep for `email` across all `respondToWebhook` nodes.

### 2A.2b n8n instance audit (MCP access, 2026-07-27)

Direct n8n access now works. The workflow I can reach matches your export exactly — **`SkyWeb Barber AI Receptionist - Phase 0-8`, id `SthkpwXtbCXnffw1`, 108 nodes**. Three findings that change the plan:

**D6 — The workflow is not running.**
```
active           : false
triggerCount     : 0
activeVersionId  : null
updatedAt        : 2026-07-26T22:07:34Z
```
Nothing is listening on either webhook. Whatever Dograh is calling, it is not this workflow object.

**D7 — Zero credentials exist on this instance, and all 31 Google nodes are unattached.**
`list_credentials` returns an empty array. Every one of the 31 `googleCalendar` / `gmail` / `googleSheets` nodes shows `credentials: NONE`. Activating this workflow as-is would fail on the first Calendar call.

This makes the V1 gotcha immediately relevant: **attaching credentials through the n8n UI strips the `operation`/`resource` discriminators.** Reattaching 31 nodes must be done via the API, followed by restoring `operation: "send"` on the 12 Gmail nodes and `resource: "calendar"` on `Create Appointment` and `Create Day Off Marker`. Budget half a day and verify each node's parameters after stamping, not just the credential.

**D8 — Instance identity is inconsistent.** The trigger URLs report a different host from the one I connect to:
```
Vapi Webhook      → n8n-production-896f.up.railway.app/webhook/e58414c0-…/skyweb-barber-basic
Shop Data Webhook → n8n-production-896f.up.railway.app/webhook/250510bd-…/barber-shop-data
```
Meanwhile my notes record the barber workflow as id `bP8xVmiwhdOafz60` on `n8n-production-7b4d.up.railway.app`, and `.claude.json` maps `n8n-production-896f` to the *Dental* project. That's **three candidate instances** and the workflow ID here matches none of the recorded ones.

Also present on this instance: `My workflow` (**active: true**, 1 trigger) and `My Sub-Workflow 1`.

**Consequence:** I can read and now also *write* workflows programmatically (`update_workflow`), which means Phases 1–6 can be applied directly rather than handed to you as JSON to import. But I will not modify anything until we establish **which instance and which workflow object Dograh actually calls** — editing an inactive copy while a different instance serves live traffic is the worst of both outcomes. This is now §16 item 10.

### 2A.2c Railway infrastructure audit (2026-07-27) — the real root cause

The n8n instance is Railway project `mindful-spontaneity` / service `n8n`, image `n8nio/n8n`, at `https://n8n-production-896f.up.railway.app`. Its Settings page has **no Volumes section** and its variables contain **no `DB_TYPE`**. Conclusion:

**D9 — n8n has no persistent storage. This is almost certainly the cause of the "it stopped" failures.**

n8n is using SQLite at `/home/node/.n8n/database.sqlite` on the container's ephemeral disk. Every redeploy destroys workflows, credentials, and execution history. And because the Source panel offers **"Configure auto updates"** on the `n8nio/n8n` image, a new upstream release can trigger that redeploy **with no human action at all**.

That explains the whole pattern we could never pin down: it works, then weeks later it has silently stopped, with a workflow present but credentials gone — which is exactly the state I found in §2A.2b (108 nodes, zero credentials, inactive). No amount of fixing the workflow addresses this; the platform is deleting the work.

It also means the V1 credential-ID notes in my memory file (`2twADx24II5a0hOS` etc.) are worthless — those rows no longer exist.

**D10 — `N8N_ENCRYPTION_KEY` is unset.** n8n generates one into that same ephemeral disk. So even with a database volume, credentials would decrypt to garbage after a key rotation. Must be set explicitly *before* any credential work.

**D11 — Region: US West (California).** The request path for a single voice tool call is: UK caller → Dograh → n8n **(California)** → Supabase **(Tokyo)** → back. That is two trans-Pacific round trips while a caller sits in silence. Voice agents need sub-second tool responses; this architecture cannot reliably deliver that. Combined with §11.4 (Supabase in Tokyo), the fix is to co-locate both in **eu-west/London**. This strengthens the §11.4 recommendation from "compliance nicety" to **"required for acceptable call latency."**

**D12 — Confirm Serverless (app sleeping) is OFF.** Railway's Serverless setting scales containers to zero and queues requests until wake-up. On an inbound phone line that means the first caller after an idle period waits many seconds and the voice agent times out. For a booking system this must be disabled.

**D13 — Billing risk: the workspace shows "26 days or $4.33 left."** On a Hobby plan at 1 GB RAM / 2 vCPU. If credit runs out the instance stops answering the phone. A client-facing booking system needs a funded paid plan and a billing alert before go-live.

**Revised Phase 0 — infrastructure comes before everything.** The order matters because the fix is itself destructive (mounting a volume or switching database starts from an empty store), so it must happen *once, deliberately, before* the 31-node credential investment:

```
P0.1  Export the workflow JSON  (already held: "Phase 0-8 (2).json")
P0.2  Add persistence:
        Minimum  → Railway Volume mounted at /home/node/.n8n   (cheap, 1 step)
        Correct  → Railway Postgres + DB_* vars                (before any paying client)
P0.3  Set N8N_ENCRYPTION_KEY (generated locally, stored in a password manager, never rotated)
P0.4  Fix the URL vars (§2A.1) + GENERIC_TIMEZONE/TZ = Europe/London  ← also fixes D3 at the root
P0.5  Turn auto-updates OFF; pin a specific n8n image tag
P0.6  Confirm Serverless/app-sleeping is OFF
P0.7  Redeploy (expect an empty n8n) → re-import the workflow JSON
P0.8  Google OAuth sign-in
P0.9  Stamp credentials onto all 31 nodes via API; restore operation/resource discriminators
P0.10 THEN the Supabase service-role swap and RLS lockdown (§3)
```

Phase 0 grows from 1–2 days to **2–3 days**, and the region move (D11/§11.4) is now on the critical path rather than optional.

### 2A.3 Confirmed unchanged

- No node writes to `call_logs` → the 0-row finding stands; Phase 6 builds it from scratch.
- No SMS node of any kind.
- No `booking_id` anywhere.
- Google Calendar is still authoritative for availability; `Supabase Overlap Check` is a secondary guard only.
- Webhook paths: **`/skyweb-barber-basic`** (voice tool) and **`/barber-shop-data`**. New endpoints follow that convention: `/barber-slot-freed`, `/barber-claim/:token`, `/barber-call-ended`, `/barber-sms-status`.

---

## 2B. PHASE 0 PROGRESS LOG (started 2026-07-27)

### Done

**n8n / Railway**
- ✅ P0.4 URL vars fixed (`https://` scheme) — resolved the OAuth `invalid_request`
- ✅ `GENERIC_TIMEZONE` / `TZ` = `Europe/London` — fixes defect **D3** at the root
- ✅ `N8N_ENCRYPTION_KEY` set explicitly
- ✅ P0.7 redeploy + barber workflow re-imported (`HOnNWmj5EO2XvEm6`, 108 nodes)
- ✅ P0.8 Gmail + Google Calendar OAuth connected
- ✅ P0.9 credentials stamped on **27 nodes** via API `setNodeCredential` (14 Calendar, 12 Gmail, 1 Gmail Trigger)
- ✅ Discriminators pinned explicitly on 28 nodes, verified against `get_node_types`
- ✅ **D14 fixed:** `Get Tomorrow Events` was the only Calendar read node missing `alwaysOutputData`; a day with no appointments tomorrow silently killed the daily reminder chain

**Supabase**
- ✅ Data hygiene: 3 junk services deactivated (`trimiing`, `Full boday`, `Nails` — 0 bookings each, `active=false` not deleted, reversible); 5 `TEST BOOKING` appointments deleted; Tue/Wed closing times 17:58/17:59 → 19:00
- ✅ Migration `p0_rls_lockdown_clients_call_logs` — **the PII hole is closed.** `clients` and `call_logs` no longer readable or deletable by `anon`. Verified live against the REST API with the anon key: `clients` 401, `call_logs` 401, `DELETE clients` 401; `appointments` / `services` / `shop_config` / `barbers` / `rpc:get_shop_data` all still return rows, so n8n is provably unaffected.
- ✅ Migration `p0_move_btree_gist_to_extensions` — clears the `extension_in_public` advisor

**Phase 1 pre-checks (both clean, so Phase 1 is de-risked)**
- ✅ 0 overlapping appointment pairs → the `EXCLUDE` constraint will apply without a data cleanup
- ✅ 0 unparseable phone numbers remaining → E.164 backfill will be clean

### Phase 1 / 5 / 6 database work — SHIPPED 2026-07-27

All applied as tracked migrations and verified against live data. Cost: £0.

| Migration | What it does | Verified |
|---|---|---|
| `p1_booking_ids` | `booking_id` + `gen_booking_id()` + BEFORE INSERT trigger + unique index + backfill; `source` column | 27/27 backfilled, 0 duplicates, 0 ambiguous chars (`B9B593`, `6R4XZR`, `2YVNJW`…) |
| `p1_overlap_guard` | `EXCLUDE USING gist` — **double-booking is now physically impossible** | Live probe against a real appointment → `REJECTED`; clean insert still works and auto-gets a booking_id |
| `p1_phone_e164` | `normalise_uk_phone()` + `customer_phone_e164` / `phone_e164` / `sms_opt_out` + backfill | 27/27 appointments and 27/27 clients normalised, **0 unparseable** |
| `p1_service_buffers_and_shop_config_v2` | `services.buffer_minutes`; 15 new `shop_config` columns (granularity, lookahead, min notice, waitlist knobs, quiet hours, white-label branding); `barber_time_off` table | defaults preserve current behaviour |
| `p1_availability_engine` | `barber_free_slots()` — Postgres-authoritative availability, kills defect **D3** by construction | live: 38 free 45-min slots for Tony, Thu 30 Jul from 09:00 |
| `p5_waitlist_schema` | 3 tables + overlapping-open-offer exclusion constraint + `gen_offer_token()` + RLS | claim tokens are unreadable even by authenticated staff |
| `p5_waitlist_functions` | `claim_slot_offer()` (the atomic gate), `match_waitlist_for_slot()`, `expire_stale_offers()` | execute revoked from anon + authenticated |
| `p6_call_logging_and_usage` | 17 `call_logs` columns + `billable_minutes` generated column + `usage_packages` + `usage_current_period` view | view reads `0 calls / 0 min / 1000 left` — the empty-account case that `count(*)` would have got wrong |
| `p2_notification_outbox` | outbox table with backoff/dead-letter/quiet-hours fields; placeholder package row | — |

**Phase 1 is essentially complete on the database side.** What remains for Phases 2–6 is n8n workflow wiring, the Twilio account, and dashboard pages.

### n8n code-node defects fixed — SHIPPED 2026-07-27

**D1 — shop-wide false "fully booked"** (`Check Slot + Alternatives`). An overlapping calendar event whose description lacked a `Barber:` line ran this branch:
```js
} else if (!evBarber) { barbers.forEach(b => { busyByBarber[b] = true; }); }   // ALL barbers
```
Every event not created by this workflow lacks that line, so one personal appointment on the calendar made the whole shop unbookable and the AI told callers it was full. Now an unattributable event blocks **nobody** and is surfaced as `unattributedEvents` / `unattributedEventCount` for review. The same bug was removed from the alternatives scan (the `|| !evBarber` clause), which had been suppressing alternative-time suggestions for the requested barber.

**D4 — silent impersonation.** Two halves:
- `Check Slot + Alternatives` email header/footer hardcoded `SkyWeb Barbers Co` and the `theskyweb-portfolio.vercel.app` logo, plus a demo Manchester address/phone. Now uses `shop.name` and optional `shop.logoUrl`, with empty-string suppression so a blank address doesn't render an empty element.
- `Normalize + Validate Request` fell back to `'SkyWeb Barber Co'` / `'theskyweb.uk@gmail.com'` when `Fetch Shop Data` failed — so a paying client's AI would introduce itself as SkyWeb and email SkyWeb's inbox. Fallbacks are now empty, a `configDegraded` flag is surfaced so the failure is visible, and `shop.logoUrl` is threaded through from `cfg.logo_url`.

**Verification method** (worth reusing — `jsCode` is a single parameter, so any edit is a full-node rewrite and a transcription slip would break booking silently): after each push, pull the node back, write it to disk, run `node --check`, and assert on the specific strings. Both nodes: **193 and 220 lines, syntax PASS**, all six assertions true, intent regexes and all 12 routes intact.

### Phase 3 — booking flow inverted, SHIPPED 2026-07-27

**Before:** `Is Slot Taken? → Create Appointment (Calendar) → Sync Booking Create (Prefer: return=minimal → returns nothing) → Respond`. Because `booking_id` is generated by a database trigger and the sync returned nothing, the workflow could never learn the reference — and the agent has to read it back on the call.

**After:** `Is Slot Taken? → Sync Booking Create (return=representation) → Create Appointment → Patch Booking Calendar Id → Respond - Booked`

Three wins beyond just getting the ID:
1. **The authoritative write happens first.** A Google Calendar failure can no longer produce a booking that exists in one system and not the other.
2. **The `EXCLUDE` constraint is now the real gate.** A double-booking is rejected by Postgres *before* a calendar event is created, rather than after.
3. **A rejected insert no longer hangs the call.** `Sync Booking Create` has `onError: continueErrorOutput`, with output 1 wired to `Respond - Slot Taken`.

Also changed: `Create Appointment`'s expressions moved from `$json.*` to explicit `$('Check Slot + Alternatives')` refs — `$json` now carries the database row, not the slot calculation, so the old references would have resolved to the wrong shape. The calendar event description now carries `Ref: <booking_id>`. New node `Patch Booking Calendar Id` writes the event id back, with `onError: continueRegularOutput` so a patch failure never loses a confirmed booking.

**Verified end-to-end against the live REST API** (not just wired): insert returned `booking_id 3R68Z4`; an overlapping insert was rejected; PATCH wrote the event id back; spoken form renders as `"3 R 6 8 Z 4"`; probe rows cleaned up.

**Known limitation:** PostgREST returns **400** (not 409) for an exclusion-constraint violation, and 400 is also what a malformed body would return. So any insert failure currently routes to "that slot's taken". An overlap is by far the most likely cause at that point — the body is workflow-constructed and validated upstream — but a genuinely malformed request would produce a misleading message. Worth an IF on the error text if it ever bites.

### Phase 4 — alternatives ladder, SHIPPED 2026-07-27

Built as **one Postgres RPC** (`find_booking_alternatives`) rather than the ~8 n8n nodes originally planned, because it reuses `barber_free_slots()` and therefore inherits DST-safety, buffer awareness and time-off handling for free. n8n gains only 3 nodes.

`barber_services` table added (33 pairs, seeded all-barbers-do-everything as a **placeholder** — this exactly preserves today's behaviour, so it was safe to ship before the real mapping is known). Ladder order follows `shop_config.alternatives_order`, default `other_barber_first` per your original spec, flippable to `same_barber_first` without a code change.

n8n: `Slot Available?[false] → Has Preferred Barber? → Find Alternatives → Respond - Alternatives`, with the IF guarding against no-barber callers and RPC failure falling back to the original response.

**Tested against real data, and two wording bugs were found and fixed:**
1. *"Sam is fully booked Tuesday"* was said whenever another barber was offered — **even when Sam was busy for a single 35-minute window and free all day otherwise.** That is a false statement to a customer. Now keyed off `barber_fully_booked`: *"Sam is booked at 2:00pm."*
2. *"the earliest I have with Tony is Tony, Friday 7th Aug 9:00am"* — the option label already carried the name. Options now expose a bare `when` for prose.

Verified output: `"Tony is fully booked Thursday. Faizan is free at 2:00pm and does Haircut too. Shall I put you in with Faizan?"`

### 🔒 Security bug found and fixed during Phase 4

`REVOKE ALL ON FUNCTION … FROM anon` **does nothing on its own.** Postgres grants `EXECUTE` to `PUBLIC` by default and both `anon` and `authenticated` inherit it, so the revokes written in the Phase 5 migration were silently ineffective. Confirmed live with the public anon key:

```
claim_slot_offer        CALLABLE BY ANON     <- SECURITY DEFINER, creates appointments
expire_stale_offers     CALLABLE BY ANON     <- mutation
match_waitlist_for_slot CALLABLE BY ANON
```

`claim_slot_offer` being reachable meant anyone with the public key could redeem waitlist tokens. Tokens are 128-bit so not guessable, but it should never have been reachable. Fixed by revoking from `PUBLIC` first, then granting to `service_role` only. Re-verified: both now return 401, while `find_booking_alternatives` stays callable (n8n needs it until the service-role swap) **and bookings still succeed** — `gen_booking_id` is deliberately left public because the `BEFORE INSERT` trigger runs as the inserting role, so over-revoking would have broken every booking.

**Lesson for the remaining migrations:** always `REVOKE FROM PUBLIC`, never just from `anon`.

### Phase 5 — waiting list, database half SHIPPED 2026-07-27

Built as a **trigger + RPC** rather than a Supabase DB webhook. `open_slot_offer()` creates the offer, matches the waiting list, mints per-recipient tokens and queues the SMS — all in the same transaction as the cancellation. `on_appointment_cancelled` fires it on any transition into `cancelled`.

That choice removes three things the plan originally needed: the DB webhook to configure, the `pg_net` dependency, and at-least-once delivery to de-duplicate. **Every** cancellation path fires it — phone, dashboard, day-off, manual SQL. SMS is queued to `notification_outbox`, never sent inline, so a provider outage cannot roll back a cancellation.

**Verified end-to-end:** cancelling a booking auto-created 1 offer → 3 recipients → 3 queued SMS → 3 waitlist rows moved to `offered` → audit logged. Then the race: **1 `claimed` (ref `SY74M4`), 2 `too_late`, exactly 1 appointment created, 0 double-booked pairs.** Idempotency confirmed incidentally — the test called the function twice per token and the second call correctly returned `already_used` rather than creating a second booking.

**Bug found and fixed:** the losers of a race were left at `status='offered'`. `match_waitlist_for_slot()` only matches `waiting`, and `expire_stale_offers()` only resets offers that *expire*, not ones that get claimed — so **losing a single race silently removed a customer from the waiting list permanently.** Now they return to `waiting`, stay matchable, and get a "sorry, gone" SMS queued. Re-verified: `waiting, waiting` / 2 still matchable / 2 notifications queued.

**Phase 5's n8n half is BLOCKED** — the claim webhook and expiry schedule both need `claim_slot_offer` / `expire_stale_offers`, which are correctly restricted to `service_role`, and n8n still authenticates as anon. Same for Phase 6's call-ended webhook (`call_logs` has no anon write policy). Both unblock the moment the `Supabase service_role` credential exists.

### ⚠️ MARKET PIVOT: UK → USA (2026-07-27)

Faizan is now targeting US barbershops, not UK. This invalidates several assumptions baked
into the build. Recorded here so the rest of the document is read in that light.

**Fixed immediately (migration `p2_normalise_phone_us_uk_and_trigger`):**

Two gaps found while wiring SMS, both of which would have silently dropped customers:

1. **`normalise_uk_phone()` rejected 6 of 8 common US formats.** `(415) 555-2671`,
   `762-744-5951`, `7627445951` and `1-762-744-5951` all returned NULL — so a US customer
   giving their number the ordinary way would be dropped to the review queue and never
   texted. Replaced with `normalise_phone()`, which handles NANP and UK without being told
   which: a UK national number always starts `0`, a NANP area code never starts `0` or `1`,
   so there is no ambiguity. Verified on 12 inputs, both locales, junk still rejected.
2. **`customer_phone_e164` was only ever backfilled — nothing maintained it.** Every *new*
   booking would have had NULL, so SMS would have had no destination. Added BEFORE
   INSERT/UPDATE triggers on `appointments` and `clients`. Verified: inserting
   `(762) 744-5951` now auto-populates `+17627445951`.

**Still to do for the US pivot:**

| Area | Change needed |
|---|---|
| **A2P 10DLC** | US carriers block unregistered long-code A2P SMS. Brand + Campaign registration takes days-to-weeks. **Longest lead time of anything remaining.** |
| Timezone | `Europe/London` is hardcoded in `shop_config`, n8n env vars, `barber_free_slots()`, and ~6 dashboard files |
| Currency | `£` in prices, overage, revenue totals |
| Date format | `en-GB` throughout the dashboard |
| Compliance | GDPR/PECR sections no longer apply. **TCPA is stricter for SMS** — prior express consent, mandatory STOP/HELP |
| Supabase region | Tokyo was wrong for UK and is still wrong for US (`us-east-1`). n8n in US West is now *correct* by accident. |

Locale-agnostic and unaffected: overlap constraint, booking IDs, waiting-list logic,
alternatives ladder.

### SMS — first template wired (2026-07-27)

`SMS - Booking Confirmed` (Twilio node, credential `3frWxqea9iIAGKp7`) runs as a **parallel
branch** off `Email - Customer Confirmation`, not in-line, so Twilio latency never sits in
the booking chain. `onError: continueRegularOutput` means a failed send cannot break a
confirmed booking — the same protection the Gmail nodes already have.

Deliberately shipped **one** template first: the test sender is a US long code
(`+17627445951`), so there was no point building four messages before confirming one arrives.

**Delivery confirmed 2026-07-27** — a Twilio Console test from `+17627445951` reached
`+923040888221`. Routing works. Caveats: trial accounts prefix every body with
*"Sent from your Twilio trial account"*, and this does **not** validate US→US, which stays
blocked on A2P 10DLC.

Three templates now live, all as parallel branches with `onError: continueRegularOutput`:

| Node | Attaches to | Note |
|---|---|---|
| `SMS - Booking Confirmed` | Email - Customer Confirmation | includes the spoken booking ref |
| `SMS - Rescheduled` | Email - Reschedule Confirmation | |
| `SMS - Cancelled` | Email - Cancellation Notice | **New customer-facing comms** — the existing cancellation email goes to the *shop*, so a caller who cancelled by phone previously received nothing |

**Temporary duplication to remove:** the reschedule and cancellation nodes inline a small
phone normaliser, because those flows still read Google Calendar rather than Supabase and
therefore hold the raw caller-supplied number instead of `customer_phone_e164`. That
duplication disappears when those flows move to database lookups (Phase 1 completion).

### Live end-to-end test — 2026-07-27

Ran a real booking and a real cancellation through `execute_workflow` (manual mode, live
external services) with the customer phone set to the Twilio-verified number.

**Booking** (`W4X4WW`, Tony, Tue 28 Jul 15:00) — every link in the Phase 3 chain confirmed:

| Step | Evidence |
|---|---|
| Config from Supabase | `configDegraded: false` |
| Availability | `available: true`, **`unattributedEvents: []`** — the D1 fix holding on real data |
| Supabase insert first | returned `booking_id: W4X4WW` |
| Phone trigger | `customer_phone_e164` auto-populated |
| Calendar event + patch back | `calendar_event_id: cdg67n54r2ib2jrjqh1sqjlbd8` |
| Timezone | stored `14:00 UTC` = `15:00 BST` ✓ |
| SMS delivered | 1 segment, correct reference |

**Cancellation** — Calendar event deleted, Supabase set to `cancelled`, SMS sent, and the
waitlist trigger fired: opened an offer, found no eligible waiters, and **auto-withdrew**
rather than leaving a phantom hold. `barber_free_slots` confirmed 15:00 free again.

**Three things the live run exposed that static analysis had not:**
1. **The n8n host timezone is `+04:00`, not `Europe/London`.** Raw output showed
   `startISO: "2026-07-28T18:00:00+04:00"`. The `TZ` / `GENERIC_TIMEZONE` Railway variables
   did not take effect. Display was correct *only* in nodes that call `.setZone()` explicitly —
   **every node that doesn't is still exposed to defect D3.**
2. `shop_config.name` has a **trailing space** — `"SkyWeb Barbers "` — visible in every SMS and email.
3. The £100 Haircut is now in customer-facing output, not just a database oddity.

### ✅ D1 and D4 — CLOSED, sweep-verified (2026-07-27)

All six copies of the hardcoded `emailWrap` de-branded and pushed. Final verification across
**all 118 nodes**:

```
SYNTAX   : all 13 code nodes PASS (node --check on the live code)
D4 SWEEP : *** CLEAN *** - no SkyWeb / portfolio logo / Manchester / 0161 anywhere
D1 SWEEP : *** CLEAN *** - no blackhole, no "|| !evBarber", no walk-in ": true"
```

**D1 turned out to be in three nodes, not one.** The original fix covered
`Check Slot + Alternatives`. Pushing the D4 changes surfaced two more instances that a
targeted search had missed:

- **`Find Soonest Slot`** — `blocksThisBarber` defaulted to `true` for an unattributable
  event, so a single stray calendar entry killed **walk-in availability** entirely.
- **`Check Reschedule Slot`** — had *both* patterns: the `busyByBarber` blackhole **and**
  the `|| !evBarber` clause in its alternatives scan. Every reschedule attempt would have
  looked unavailable.

Each also now reports `unattributedEvents` for observability.

**A bug in my own earlier work, caught here:** `SMS - Rescheduled` referenced
`$json.startTimeLabel`, which `Check Reschedule Slot` never produced — the message would
have read *"moved to Tuesday 28 July at **undefined**"*. Added `startTimeLabel` to that
node's output. Worth noting the SMS node had been reviewed and looked correct in isolation;
only tracing the field back to its producer exposed it.

Bonus fixes made in the same pass: booking references now flow into cancellation,
reschedule and day-off emails, and a D3 `setZone` instance was fixed in
`Find Affected Bookings`.

### ❗ D4 — full audit, third attempt (2026-07-27)

I recorded D4 as fixed twice, and was wrong both times, because each audit only covered the
path I happened to be working on. A **complete sweep of all 118 nodes' parameters** finally
gives the real picture.

**Root cause:** `emailWrap()` — with the shop name, logo, Manchester address and `0161 123 4567`
baked in — is **copy-pasted into six separate Code nodes.** n8n Code nodes can't share
helpers, so every branch grew its own copy and they drift independently.

| Code node | Status |
|---|---|
| `Check Slot + Alternatives` | ✅ fixed |
| `Build Reminder Email` | ✅ fixed (this session) |
| `Check Reschedule Slot` | ❌ still hardcoded |
| `Find Booking To Cancel` | ❌ still hardcoded |
| `Find Soonest Slot` | ❌ still hardcoded |
| `Find Affected Bookings` | ❌ still hardcoded |
| `Parse Day Off Email` | ❌ contains a SkyWeb reference |

*(The `SkyWeb` hits on the 10 googleCalendar nodes are only `cachedResultName:
"SkyWeb Barber Shop Calendar"` — a display cache of the calendar's name. The actual value is
`primary`, so they're harmless.)*

**Lesson:** for a defect of the form "X appears somewhere it shouldn't", the fix is not
complete until a **sweep of every node** returns clean. Fixing the instance in front of you
and declaring victory is how this got mis-reported twice. The sweep command is in
`RUNBOOK_SKYWEB.md`.

### ❗ D4 was NOT fully fixed — earlier partial correction

I previously recorded defect D4 (hardcoded SkyWeb branding) as fixed. That was wrong: I only
audited the booking path. Two further nodes still carry it:

- **`Build Reminder Email`** defines its *own* hardcoded `shopConfig` — `name: 'SkyWeb Barbers Co'`,
  `phone: '0161 123 4567'` — plus the portfolio logo. Worse, the daily reminder branch
  (`Daily Reminder Trigger → Get Tomorrow Events → Build Reminder Email`) never calls
  `Fetch Shop Data`, so it *cannot* use real shop config without a structural change.
  **A client's reminder emails would go out branded SkyWeb.**
- **`Find Booking To Cancel`** falls back to the demo Manchester phone number.

The 24-hour reminder SMS is deferred until `Build Reminder Email` is fixed — it also needs
to expose the customer's phone, which it currently doesn't parse out of the event.

### Documentation — SHIPPED 2026-07-27

- **`docs/ONBOARD_A_CLIENT.md`** — top-to-bottom checklist for a new shop, with the
  "ask the client for this on day one" list up front. Written so the answer to every step
  is config, never code. Ends with an explicit **"not ready yet — do not sell these"**
  section covering SMS, the waiting list and call logging.
- **`docs/RUNBOOK_SHOP.md`** — one page for the barber, plain English. What each page does,
  the everyday jobs, how booking references work (including that a lost reference must
  never stop a cancellation), and what "the AI did something odd" usually means.
- **`docs/RUNBOOK_SKYWEB.md`** — internal. Symptom → cause table, procedures, key rotation,
  and a **"gotchas that have already cost time"** section capturing the eight traps hit
  during this build (the `REVOKE FROM PUBLIC` trap, `security_invoker` on views, pgcrypto's
  schema, `position` being reserved, `count(*)` over LEFT JOIN, the `resource: calendar`
  misdiagnosis, and the rest). Plus a standing known-risks table.

### Dashboard round 2 — SHIPPED 2026-07-27

| Feature | Why it matters |
|---|---|
| **Settings → Who Does What** (`BarberServices.jsx`) | Barber × service matrix. Warns when the placeholder "everyone does everything" seed is still in place, flags services nobody can do, and flags barbers with nothing ticked. This is what stops the AI offering a 2-hour colour with a clippers-only barber. |
| **Settings → Plan & Usage** (`PackageSettings.jsx`) | Edit the package, roll to the next period. Warning banner on the placeholder row so nobody invoices against it. |
| **Booking refs in Clients** | Shown under the next visit and **searchable** — the real workflow is a customer reading the ref down the phone. |
| **Booking refs in Calendar** | Detail drawer (gold monospace), plus CSV and PDF exports. |

**Verified end-to-end, dashboard → database → phone behaviour:**

| Matrix state | What `find_booking_alternatives` offers |
|---|---|
| Faizan ticked for Haircut | `Faizan, Sam` |
| Faizan unticked | `Sam` only |

**Testing note worth recording:** the first version of this test appeared to pass but proved nothing — the ladder returned "none" simply because Tony was free on the test date, so there was no alternative to offer at all. The toggle had demonstrated the database write, not the phone behaviour. Blocking Tony's day first turned it into a real test. *An assertion that passes for the wrong reason is worse than no assertion.*

### Dashboard work — SHIPPED 2026-07-27

| Change | Files |
|---|---|
| **White-label complete (§4 / defect D4)** — zero hardcoded shop identity left in `src/` (grep verified) | `brand.js` (new), `ShopContext.jsx` (new), `Sidebar.jsx`, `Login.jsx`, `App.jsx`, `Calls.jsx`, `index.html` |
| **Usage page** (Phase 6 UI) — minutes/calls meters with 75%/90% colour thresholds, AI-handled vs needed-a-human, overage cost, minutes-per-day chart, recent calls | `pages/Usage.jsx` (new) |
| **Waiting List page** (Phase 5 UI) — live offer countdowns, priority bump, remove, realtime subscriptions | `pages/Waitlist.jsx` (new) |
| Nav + icons | `Sidebar.jsx`, `Icon.jsx` (`gauge`, `hourglass`) |
| `.env.example` documenting the per-client branding vars | new |
| **Fixed stale dev-server path** — `launch.json` pointed at `n8n\barber-dashboard`, but the project moved to `01-barber\Barber Receptionist\barber-dashboard`. Spaces in the path break `npm --prefix`, so it now uses a `.bat` wrapper like the beauty-dashboard entry | `.claude/launch.json`, `~/.claude/barber-dev.bat` |

Branding fallback chain is `shop_config` → build-time env → generic `"Barbershop"`. It deliberately never falls back to another business's name, so a config read failure can't make a client's dashboard claim to be SkyWeb (defect D4).

**Verified:** production build passes; dev server runs on :5174; login screen renders the neutral fallback; **zero console errors**; lint clean apart from pre-existing warnings.
**Not verified:** the Usage and Waiting List pages render behind authentication, and I don't hold dashboard credentials — those need a visual check by Faizan.

### ⚠️ Out of scope but found while working: dental + physio have the same exposure

The `anon` grant audit turned up the identical non-enforcing-RLS pattern on **18 dental_* and physio_* tables** in the same database — including `dental_patients`, `dental_call_logs`, `physio_call_logs` and `physio_red_flag_logs`. Those hold patient names, phone numbers, transcripts, reported symptoms and clinical triage records. Under UK GDPR that is **special-category health data**, making the exposure materially more serious than the barber case.

Not fixed here: the same ordering trap applies (the dental/physio n8n workflows may depend on the anon key), so it needs its own audit. Tracked as a separate task.

### Corrections made to this plan during execution
- The memory note (and n8n's own validator) claiming `Create Appointment` needs `resource: "calendar"` is **wrong** — `calendar` only supports the `availability` operation and would have stopped event creation. Correct: `resource: "event"` + `operation: "create"`, verified against the node type definition.
- `Haircut` at £100 is **not** junk — it has 9 real appointments. Left untouched; the real price is needed (§16 item 6).
- `get_workflow_details` does not return the `credentials` field, so credential attachment cannot be verified through the API — only in the UI.

### Blocked / outstanding
| Item | Blocked on |
|---|---|
| P0.10 RLS lockdown of `appointments` + revoke anon on `get_shop_data`/`is_admin` | **service-role key in an n8n Header Auth credential** — the anon key is load-bearing until then |
| Repoint 8 Supabase HTTP nodes off inline anon headers | same (n8n's validator independently flags all 16 as `HARDCODED_CREDENTIALS`) |
| ~~`services` / `barbers` blanket-true write policies~~ | ✅ **RESOLVED 2026-07-27** — `Barbers.jsx`/`Services.jsx` gate every write (add/edit/remove) behind `isAdmin`; no non-admin self-edit path exists anywhere in the dashboard. The `is_admin()`-gated migration in §3.2 is safe to apply as written, no UI changes needed. Not yet applied — still needs the branch-first check below, or an explicit go-ahead to run on prod. |
| 4 `Sheets - Log *` nodes | no `googleSheetsOAuth2Api` credential exists yet |
| Leaked-password protection | Supabase Auth dashboard setting (manual) |
| P0.2 persistence | **still unresolved** — volume declined, Postgres undecided |
| Migrations 001–009 (Phase 1 foundation) | **Supabase branching is not available on this project's plan** (`PaymentRequiredException: Branching is supported only on the Pro plan or above`, confirmed 2026-07-27). §5's "branch first, merge after" requirement can't be followed until either the project upgrades to Pro, or you explicitly accept running tested-but-unbranched SQL straight on production. |
| P0.5 auto-updates off / pin image tag | manual, Railway Settings |
| Real Haircut price, real trading hours | client input |
| Dental (125 nodes) + LinkedIn (23 nodes) re-import | manual |

---

## 3. PHASE 0 — Launch blockers (do first, ~1 day)

### 3.1 The RLS hole, precisely

Actual policies on the live database right now:

| Table | Policy | Role | Command | Expression |
|---|---|---|---|---|
| `appointments` | `anon_write_appointments` | **anon** | **ALL** | `USING(true) WITH CHECK(true)` |
| `call_logs` | `allow_all` | **public** | **ALL** | `USING(true) WITH CHECK(true)` |
| `clients` | `allow_all` | **public** | **ALL** | `USING(true) WITH CHECK(true)` |
| `barbers` | `auth_update/insert/delete_barbers` | authenticated | UPDATE/INSERT/DELETE | `true` |
| `services` | `auth_update/insert/delete_services` | authenticated | UPDATE/INSERT/DELETE | `true` |

Read as: **the anon key can delete your appointment book and exfiltrate your client list.** Any logged-in barber can delete other barbers and rewrite prices, ignoring the `is_admin()` policies that sit alongside (Postgres RLS is permissive-OR — one `true` policy defeats every restrictive one next to it).

### 3.2 The fix

> ⚠️ **ORDERING GATE — read §2A.1 #1 first.** n8n currently authenticates to Supabase with the **anon key**, so the `anon` write policy is load-bearing. Applying the SQL below before repointing n8n to the service-role key **stops every booking from syncing and breaks the Dograh shop-data feed.** Steps 0a–0c must complete and be tested first.

The correct model: **the browser never writes appointments; n8n writes them with the service-role key.**

```
anon           → nothing. Revoke entirely.
authenticated  → SELECT on operational tables; UPDATE limited to own barber row
authenticated + is_admin() → write services / shop_config / barbers / packages
service_role   → full access (n8n only, key never leaves the server)
```

Migration `000_rls_lockdown.sql`:
```sql
-- appointments
drop policy if exists anon_write_appointments      on public.appointments;
drop policy if exists anon_read_appointments       on public.appointments;
drop policy if exists authenticated_read_appointments on public.appointments;
create policy appt_read_auth on public.appointments
  for select to authenticated using (true);
create policy appt_write_admin on public.appointments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- (no anon policy at all; service_role bypasses RLS)

-- clients + call_logs: contain personal data, staff-only
drop policy if exists allow_all on public.clients;
drop policy if exists allow_all on public.call_logs;
create policy clients_read_auth   on public.clients   for select to authenticated using (true);
create policy calllogs_read_auth  on public.call_logs for select to authenticated using (true);

-- barbers / services: drop the blanket-true writes, keep is_admin()
drop policy if exists auth_update_barbers  on public.barbers;
drop policy if exists auth_insert_barbers  on public.barbers;
drop policy if exists auth_delete_barbers  on public.barbers;
drop policy if exists auth_update_services on public.services;
drop policy if exists auth_insert_services on public.services;
drop policy if exists auth_delete_services on public.services;
-- barbers may update their own row only
create policy barber_update_self on public.barbers
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_logs has RLS on with zero policies (fail-closed). Give admins read.
create policy audit_read_admin on public.audit_logs
  for select to authenticated using (public.is_admin());

revoke all on public.appointments, public.clients, public.call_logs from anon;
```

**Verification gate:** with only the anon key, `select * from clients` must return 0 rows and `delete from appointments` must fail. Test this from a clean browser before signing Phase 0 off.

### 3.3 Also in Phase 0

- **`is_admin()` and `get_shop_data()` are `security definer` and executable by `anon`.** Revoke `anon` execute on both; `get_shop_data` should be reachable by `service_role` only (n8n calls it).
- **Enable leaked-password protection** in Auth settings.
- **Move `btree_gist` out of `public`** into `extensions`.
- **Data hygiene:** delete the 4 junk services, fix `Haircut` £100 → real price, fix Tue/Wed closing times to 19:00, delete the 5 `TEST BOOKING n - ignore` appointments.
- **Confirm the service-role key is not in the dashboard bundle.** `grep -r "service_role\|eyJ...role.*service" dist/` must return nothing.

---

## 4. Client onboarding: zero hardcoded identity

You said you'll give me the real barber's name and address once you land the client. For that to be a 10-minute job rather than a code hunt, shop identity has to be **data**. It currently isn't in five places:

| File | Line | Hardcoded |
|---|---|---|
| `src/components/Sidebar.jsx` | 28 | `SkyWeb Barbers Co` |
| `src/pages/Login.jsx` | 24 | `SkyWeb Barbers Co` |
| `src/pages/Calls.jsx` | 80 | `Call Logs — SkyWeb Barber` (PDF header) |
| `src/App.jsx` | 62, 75 | logo hotlinked from `theskyweb-portfolio.vercel.app` |
| `src/pages/Login.jsx` | 23 | same logo URL |
| n8n `Normalize + Validate Request` | — | shop name, barber list, emails in a JS object |
| Dograh Global Node | — | `{{shop_name}}` template var — already parameterised ✅ |

**Changes:**
1. Add to `shop_config`: `logo_url`, `brand_primary_colour`, `website`, `booking_url`, `sms_sender_id`, `legal_entity_name`, `ico_registration`.
2. Dashboard loads `shop_config` once into a `ShopProvider` React context; every label reads from it. No literal shop name anywhere in `src/`.
3. Host the logo in Supabase Storage, not on your portfolio domain — otherwise a client's staff dashboard breaks when you redeploy your portfolio, and it shows *your* branding.
4. n8n reads shop config from `get_shop_data()` at the top of every execution — delete the hardcoded JS object.
5. Write `docs/ONBOARD_A_CLIENT.md`: a 15-item checklist (shop row, barbers, services + durations + buffers, opening hours, phone number, Twilio sender, Google Calendar, package, logo, test call). This is the artefact that makes the second client take an afternoon instead of a week.

**Scope note:** this is *single-tenant per deployment* — one Supabase project + one n8n + one dashboard per barber shop. True multi-tenancy (one deployment, `tenant_id` on every row) is a much larger change and I'd only do it at 5+ clients. Flagging so the choice is deliberate.

---

## 5. Migration set (all tested)

Applied to a **Supabase branch** first, verified, then merged. Never straight to production.

```
000_rls_lockdown.sql        §3 — security. Ships alone, verified alone.
001_extensions.sql          btree_gist into extensions; confirm pgcrypto location
002_booking_ids.sql         booking_id + generator + trigger + unique index + backfill
003_overlap_guard.sql       EXCLUDE constraint — makes double-booking impossible
004_phone_e164.sql          normalise_uk_phone() + columns + backfill + review queue
005_service_buffers.sql     services.buffer_minutes (default 5)
006_shop_config_v2.sql      slot granularity, lookahead, waitlist knobs, quiet hours, branding
007_time_off.sql            barber_time_off (replaces calendar-event day-off markers)
008_availability.sql        barber_free_slots()
009_waitlist.sql            3 tables + claim_slot_offer() + match_waitlist_for_slot() + expire_stale_offers()
010_call_logging.sql        call_logs v2 columns + billable_minutes generated column
011_usage_packages.sql      usage_packages + usage_current_period view
012_outbox.sql              notification outbox (§10.2)
013_rls_new_tables.sql      policies for every table added above
014_retention.sql           GDPR retention + erasure function (§11)
015_db_webhook.sql          appointments UPDATE → n8n /barber-slot-freed
```

### 5.1 Booking IDs — tested

```sql
-- 6 chars from a 30-char alphabet with 0/O, 1/I/L and U removed. 729M combinations.
-- CSPRNG (pgcrypto), rejection-sampled to remove modulo bias.
-- NOTE: extensions.gen_random_bytes is FULLY QUALIFIED. This is not optional —
-- see §13.1 defect #2.
create or replace function public.gen_booking_id() returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text; b int; i int; guard int := 0;
begin
  loop
    guard := guard + 1;
    if guard > 50 then raise exception 'gen_booking_id: 50 collisions in a row'; end if;
    code := ''; i := 0;
    while i < 6 loop
      b := get_byte(extensions.gen_random_bytes(1), 0);
      if b < 240 then                          -- 240 = 8*30, kills modulo bias
        code := code || substr(alphabet, 1 + (b % 30), 1);
        i := i + 1;
      end if;
    end loop;
    exit when not exists (select 1 from public.appointments a where a.booking_id = code);
  end loop;
  return code;
end $$;

create or replace function public.set_booking_id() returns trigger
language plpgsql as $$
begin
  if new.booking_id is null then new.booking_id := public.gen_booking_id(); end if;
  return new;
end $$;

create trigger appointments_booking_id before insert on public.appointments
  for each row execute function public.set_booking_id();
create unique index appointments_booking_id_key on public.appointments(booking_id);
```

Trigger-based, so **every** write path gets an ID — phone, dashboard, waitlist claim, manual SQL. Backfill the 32 existing rows with `update appointments set booking_id = gen_booking_id() where booking_id is null;` (row-by-row via a loop so the collision check sees prior rows).

### 5.2 Overlap guard — tested, 5/5

```sql
create extension if not exists btree_gist with schema extensions;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    barber_name with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status <> 'cancelled');
  -- predicate deliberately mirrors the live `Supabase Overlap Check` node
  -- (status=neq.cancelled) so the DB guard and the workflow guard can never
  -- disagree, including for statuses added later (completed, no_show). See §2A.1 #2.
```

`'[)'` bounds mean a 14:45 start immediately after a 14:00–14:45 booking is **allowed**, while any real overlap is rejected at the storage layer. Cancelled rows stop blocking, so freed slots are reusable. Reschedule onto an occupied slot is rejected too.

This is the single highest-value line in the plan: it makes double-booking impossible regardless of what n8n, the dashboard, or a future integration does wrong.

> Before applying, check for pre-existing overlaps or the `ALTER` will fail:
> ```sql
> select a.id, b.id, a.barber_name, a.start_time from appointments a join appointments b
>  on a.barber_name=b.barber_name and a.id<>b.id
>  and a.status <> 'cancelled' and b.status <> 'cancelled'
>  and tstzrange(a.start_time,a.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)');
> ```

### 5.3 Phone normalisation — tested, 15/15

```sql
create or replace function public.normalise_uk_phone(p text) returns text
language plpgsql immutable as $$
declare d text;
begin
  if p is null or btrim(p) = '' then return null; end if;
  d := regexp_replace(p, '[^0-9+]', '', 'g');

  if    d ~ '^0044' then d := '+44' || substr(d, 5);
  elsif d ~ '^\+44' then d := '+44' || substr(d, 4);
  elsif d ~ '^44'   then d := '+44' || substr(d, 3);
  end if;

  if d ~ '^\+440' then d := '+44' || substr(d, 5); end if;   -- "+44 (0)7700..."

  if d ~ '^\+44[1-9][0-9]{8,9}$' then return d; end if;
  if d ~ '^0[1-9][0-9]{8,9}$'    then return '+44' || substr(d, 2); end if;
  if d ~ '^\+[1-9][0-9]{7,14}$'  then return d; end if;
  return null;                                               -- → manual review queue
end $$;
```

Verified: `07700900123`, `+447700900123`, `0044 7700 900123`, `447700900123`, `07700 900 123`, `+44 (0)7700 900123`, `0044 (0)20 1234 5678` all → correct E.164. `020 1234 5678` → `+442012345678`. `0000000005`, `abc`, `''`, `null`, `7700900123`, over-length → `null`.

Anything returning `null` goes to a **Needs Attention** list in the dashboard rather than being silently dropped — otherwise a customer just never gets their reminder.

### 5.4 Availability engine — tested

```sql
create or replace function public.barber_free_slots(
  p_barber text, p_date date, p_duration_min integer,
  p_buffer_min integer default 5, p_now timestamptz default now()
) returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable
set search_path = public, extensions
as $$
declare
  c shop_config; v_hours jsonb;
  v_open timestamptz; v_close timestamptz;
  v_step interval; v_dur interval; v_earliest timestamptz;
begin
  select * into c from shop_config limit 1;
  if not found then raise exception 'shop_config is empty'; end if;

  v_hours := c.open_hours -> extract(isodow from p_date)::text;
  if v_hours is null or jsonb_typeof(v_hours) = 'null' then return; end if;   -- closed

  -- built as LOCAL wall-clock then converted: BST/GMT handled by Postgres, not by us
  v_open  := ((p_date::text || ' ' || (v_hours ->> 0))::timestamp) at time zone c.timezone;
  v_close := ((p_date::text || ' ' || (v_hours ->> 1))::timestamp) at time zone c.timezone;

  v_step     := make_interval(mins => c.slot_granularity_minutes);
  v_dur      := make_interval(mins => p_duration_min);
  v_earliest := p_now + make_interval(mins => c.min_notice_minutes);

  return query
  with candidate as (
    select g as s, g + v_dur as e
    from generate_series(v_open, v_close - v_dur, v_step) g
  )
  select cd.s, cd.e from candidate cd
  where cd.s >= v_earliest
    and not exists (                                  -- real booking (+ buffer both sides)
      select 1 from appointments a
      where a.barber_name = p_barber
        and a.status <> 'cancelled'
        and tstzrange(a.start_time - make_interval(mins => p_buffer_min),
                      a.end_time   + make_interval(mins => p_buffer_min), '[)')
            && tstzrange(cd.s, cd.e, '[)'))
    and not exists (                                  -- live waitlist hold
      select 1 from barber_slot_offers o
      where o.barber_name = p_barber and o.status = 'open' and o.expires_at > p_now
        and tstzrange(o.slot_start, o.slot_end, '[)') && tstzrange(cd.s, cd.e, '[)'))
    and not exists (                                  -- barber holiday / shop closure
      select 1 from barber_time_off t
      where (t.barber_name = p_barber or t.barber_name is null)
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(cd.s, cd.e, '[)'))
  order by cd.s;
end $$;
```

Verified behaviours: a 45-min service correctly finds **no** afternoon slot around buffered bookings while a 20-min service finds `15:15` and `15:30`; opens at **09:00 local in both August (BST) and December (GMT)**; Sunday returns 0 rows; `min_notice_minutes = 120` with `now = 09:00` yields a first slot of `11:00`.

Buffers come from `services.buffer_minutes` (new column, default 5) — a skin fade needs clean-up time that a beard trim doesn't.

### 5.5 Waiting list — tested

Three tables, plus a **second** exclusion constraint so two overlapping offers for the same barber can't be open at once:

```sql
create table public.barber_waitlist (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone_e164 text not null,
  customer_email text,
  service_name text not null,
  service_duration_minutes integer not null,
  preferred_barber text,
  any_barber boolean not null default false,
  date_from date not null,
  date_to date not null,
  time_window text not null default 'any',
  status text not null default 'waiting',
  priority integer not null default 0,
  offers_sent integer not null default 0,
  offers_unanswered integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint waitlist_window_sane   check (date_to >= date_from),
  constraint waitlist_barber_choice check (any_barber or preferred_barber is not null),
  constraint waitlist_time_window   check (time_window in ('morning','afternoon','evening','any')),
  constraint waitlist_status        check (status in ('waiting','offered','booked','expired','cancelled'))
);

create table public.barber_slot_offers (
  id uuid primary key default gen_random_uuid(),
  barber_name text not null,
  slot_start timestamptz not null,
  slot_end   timestamptz not null,
  source_appointment_id uuid references public.appointments(id),
  status text not null default 'open',
  claimed_by_waitlist_id uuid references public.barber_waitlist(id),
  claimed_appointment_id uuid references public.appointments(id),
  claimed_at timestamptz,
  opened_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint slot_offer_status check (status in ('open','claimed','expired','withdrawn')),
  constraint slot_offer_sane   check (slot_end > slot_start)
);

-- only one OPEN offer may cover a given barber+window
alter table public.barber_slot_offers
  add constraint slot_offers_no_overlapping_open
  exclude using gist (barber_name with =, tstzrange(slot_start, slot_end, '[)') with &&)
  where (status = 'open');

create table public.barber_offer_recipients (
  id uuid primary key default gen_random_uuid(),
  offer_id    uuid not null references public.barber_slot_offers(id) on delete cascade,
  waitlist_id uuid not null references public.barber_waitlist(id)    on delete cascade,
  token text not null unique,
  sent_at timestamptz, sms_sid text, sms_status text,
  responded_at timestamptz, response text,
  unique (offer_id, waitlist_id)
);

-- 22-char url-safe, 128-bit, no base64 padding (fits an SMS, survives a copy-paste)
create or replace function public.gen_offer_token() returns text
language sql set search_path = public, extensions as $$
  select rtrim(replace(replace(encode(extensions.gen_random_bytes(16),'base64'),'/','_'),'+','-'), '=')
$$;
```

### 5.6 The atomic claim — tested, 7/7

The whole waiting-list feature stands or falls on this function. **A single guarded `UPDATE` is atomic in Postgres**: concurrent transactions serialise on the row lock, the losers re-evaluate `status='open'`, see it's false, and match zero rows. No advisory locks, no application mutex, no window for two winners.

```sql
create or replace function public.claim_slot_offer(p_token text)
returns table (o_result text, o_booking_id text, o_barber text,
               o_slot_start timestamptz, o_slot_end timestamptz,
               o_service text, o_customer text)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_rcp barber_offer_recipients; v_offer barber_slot_offers;
  v_wl barber_waitlist;          v_appt appointments;
begin
  select * into v_rcp from barber_offer_recipients r where r.token = p_token;
  if not found then
    return query select 'invalid'::text, null::text, null::text,
                        null::timestamptz, null::timestamptz, null::text, null::text;
    return;
  end if;

  -- idempotent: the winner tapping their own link twice sees their booking, not an error
  if v_rcp.response = 'claimed' then
    select * into v_offer from barber_slot_offers o where o.id = v_rcp.offer_id;
    select * into v_appt  from appointments a where a.id = v_offer.claimed_appointment_id;
    return query select 'already_used'::text, v_appt.booking_id, v_appt.barber_name,
                        v_appt.start_time, v_appt.end_time, v_appt.service_name, v_appt.customer_name;
    return;
  end if;

  -- ===== THE ATOMIC GATE =====
  update barber_slot_offers o
     set status = 'claimed', claimed_by_waitlist_id = v_rcp.waitlist_id, claimed_at = now()
   where o.id = v_rcp.offer_id and o.status = 'open' and o.expires_at > now()
  returning o.* into v_offer;

  if not found then                                    -- someone else won, or it expired
    update barber_offer_recipients r set responded_at = now(), response = 'too_late'
      where r.id = v_rcp.id and r.response is null;
    return query select 'too_late'::text, null::text, null::text,
                        null::timestamptz, null::timestamptz, null::text, null::text;
    return;
  end if;

  select * into v_wl from barber_waitlist w where w.id = v_rcp.waitlist_id;

  begin
    insert into appointments (barber_name, customer_name, customer_phone, customer_phone_e164,
                             customer_email, service_name, service_price,
                             start_time, end_time, status, source, notes)
    select v_offer.barber_name, v_wl.customer_name, v_wl.customer_phone_e164,
           v_wl.customer_phone_e164, v_wl.customer_email, v_wl.service_name, s.price,
           v_offer.slot_start, v_offer.slot_end, 'confirmed', 'waitlist',
           'Claimed from waiting list'
      from (select price from services where name = v_wl.service_name limit 1) s
    returning * into v_appt;
  exception when exclusion_violation then
    -- a phone caller took the slot in the same instant: unwind cleanly
    update barber_slot_offers o set status='withdrawn',
           claimed_by_waitlist_id=null, claimed_at=null where o.id = v_offer.id;
    update barber_offer_recipients r set responded_at=now(), response='too_late'
      where r.id = v_rcp.id;
    return query select 'too_late'::text, null::text, null::text,
                        null::timestamptz, null::timestamptz, null::text, null::text;
    return;
  end;

  update barber_slot_offers o set claimed_appointment_id = v_appt.id where o.id = v_offer.id;
  update barber_waitlist   w set status = 'booked'       where w.id = v_wl.id;
  update barber_offer_recipients r set responded_at = now(), response = 'claimed'
    where r.id = v_rcp.id;
  update barber_offer_recipients r set responded_at = now(), response = 'too_late'
    where r.offer_id = v_offer.id and r.id <> v_rcp.id and r.response is null;

  return query select 'claimed'::text, v_appt.booking_id, v_appt.barber_name,
                      v_appt.start_time, v_appt.end_time, v_appt.service_name, v_appt.customer_name;
end $$;

revoke all on function public.claim_slot_offer(text) from anon, authenticated;
-- n8n (service_role) calls it; the token is the credential
```

Note the `exception when exclusion_violation` block. Without §5.2's constraint that branch could never fire and a double-booking would silently succeed. The constraint and the function are one design, not two.

### 5.7 Matching and expiry — tested

```sql
create or replace function public.match_waitlist_for_slot(p_offer_id uuid, p_limit int default 5)
returns table (waitlist_id uuid, customer_name text, phone_e164 text,
               wl_service text, offer_rank int)     -- NB: not "position", reserved word (§13.1 #4)
language plpgsql stable set search_path = public
as $$
declare o barber_slot_offers; tz text; local_start timestamp; slot_min int;
begin
  select * into o from barber_slot_offers x where x.id = p_offer_id;
  if not found then return; end if;
  select s.timezone into tz from shop_config s limit 1;
  local_start := o.slot_start at time zone tz;
  slot_min    := extract(epoch from (o.slot_end - o.slot_start)) / 60;

  return query
  select w.id, w.customer_name, w.customer_phone_e164, w.service_name,
         row_number() over (order by w.priority desc, w.created_at asc)::int
  from barber_waitlist w
  where w.status = 'waiting'
    and (w.expires_at is null or w.expires_at > now())
    and (w.any_barber or w.preferred_barber = o.barber_name)
    and local_start::date between w.date_from and w.date_to
    and w.service_duration_minutes <= slot_min          -- a 20-min gap ≠ a 45-min skin fade
    and w.offers_unanswered < 4                         -- stop pestering the unresponsive
    and case w.time_window
          when 'morning'   then local_start::time <  '12:00'
          when 'afternoon' then local_start::time >= '12:00' and local_start::time < '17:00'
          when 'evening'   then local_start::time >= '17:00'
          else true end
    and not exists (select 1 from barber_offer_recipients r
                    where r.offer_id = o.id and r.waitlist_id = w.id)
  order by w.priority desc, w.created_at asc
  limit p_limit;
end $$;

create or replace function public.expire_stale_offers() returns integer
language plpgsql set search_path = public as $$
declare n int;
begin
  with done as (
    update barber_slot_offers o set status='expired'
     where o.status='open' and o.expires_at <= now() returning o.id),
  bumped as (
    update barber_offer_recipients r set response='no_response', responded_at=now()
     where r.offer_id in (select id from done) and r.response is null
    returning r.waitlist_id)
  update barber_waitlist w
     set offers_unanswered = w.offers_unanswered + 1,
         status = case when w.status='offered' then 'waiting' else w.status end
   where w.id in (select waitlist_id from bumped);
  get diagnostics n = row_count;
  return n;
end $$;
```

Verified: a 17:30 slot correctly **skips** an afternoon-only waiter and ranks the two flexible ones by join order; a 20-minute gap matches **nobody** waiting for a 45-minute service; expiry flips `open → expired` and increments `offers_unanswered`.

### 5.8 Usage & minutes — tested

```sql
alter table public.call_logs
  add column call_id text unique,
  add column direction text not null default 'inbound',
  add column from_number text, add column to_number text,
  add column caller_phone_e164 text,
  add column started_at timestamptz, add column ended_at timestamptz,
  add column duration_seconds integer,
  add column billable_minutes integer generated always as
      (greatest(1, ceil(coalesce(duration_seconds,0) / 60.0)::int)) stored,
  add column handled_by text not null default 'ai',
  add column transferred_to text, add column ended_reason text,
  add column booking_id text,
  add column recording_url text, add column transcript text,
  add column provider text, add column provider_cost numeric,
  add column consent_given boolean, add column consent_at timestamptz,
  add constraint call_handled_by check (handled_by in ('ai','transferred','voicemail','missed'));

create index call_logs_started_at_idx on public.call_logs (started_at desc);

create table public.usage_packages (
  id uuid primary key default gen_random_uuid(),
  plan_name text not null,
  included_calls integer, included_minutes integer,        -- null = unmetered
  cap_mode text not null default 'either',                 -- either | calls | minutes
  period_start date not null, period_end date not null,    -- period_end is EXCLUSIVE
  overage_per_minute numeric not null default 0,
  overage_per_call   numeric not null default 0,
  monthly_price numeric,
  timezone text not null default 'Europe/London',
  active boolean not null default true,
  constraint pkg_period_sane check (period_end > period_start),
  constraint pkg_cap_mode    check (cap_mode in ('either','calls','minutes'))
);
create unique index usage_packages_one_active on public.usage_packages (active) where active;

create or replace view public.usage_current_period as
select p.id as package_id, p.plan_name, p.period_start, p.period_end,
       p.included_calls, p.included_minutes, p.cap_mode,
       p.overage_per_minute, p.overage_per_call,
       count(c.id)                                             as calls_received,
       count(c.id) filter (where c.handled_by='ai')             as calls_ai_handled,
       count(c.id) filter (where c.handled_by='transferred')    as calls_transferred,
       count(c.id) filter (where c.handled_by='missed')         as calls_missed,
       count(c.id) filter (where c.booking_id is not null)      as calls_with_booking,
       coalesce(sum(c.billable_minutes),0)                      as minutes_used,
       greatest(0, p.included_minutes - coalesce(sum(c.billable_minutes),0)) as minutes_left,
       greatest(0, p.included_calls   - count(c.id))                        as calls_left,
       greatest(0, coalesce(sum(c.billable_minutes),0) - p.included_minutes) as overage_minutes,
       round(coalesce(avg(c.duration_seconds),0))               as avg_seconds,
       max(c.duration_seconds)                                  as longest_seconds
from public.usage_packages p
left join public.call_logs c
       on c.started_at >= (p.period_start::timestamp at time zone p.timezone)
      and c.started_at <  (p.period_end::timestamp   at time zone p.timezone)
where p.active
group by p.id, p.plan_name, p.period_start, p.period_end, p.included_calls,
         p.included_minutes, p.cap_mode, p.overage_per_minute, p.overage_per_call;
```

**Two subtleties that were tested rather than assumed:**

- `count(c.id)`, not `count(*)` or `count(c.*)`. With a `LEFT JOIN` and zero calls, `count(*)` returns **1**, which would show "1 call received" on a brand-new account. Verified: empty period reads `0 calls / 0 minutes / 1000 left`.
- The period join casts through `p.timezone`. A call at **00:30 BST on 1 July** is `23:30 UTC on 30 June` — it belongs to July's bill in London. Verified: that call counts, while `2026-06-30 23:30 BST` and `2026-08-01 00:30 BST` correctly don't.

Rounding: `ceil`, minimum 1 minute, per call. Verified 30s→1, 59s→1, 60s→1, 61s→2, 120s→2, 121s→3, 300s→5. **State this on the dashboard** ("calls are rounded up to the nearest minute") so it never becomes an argument at invoice time.

---

## 6. Feature A — Booking IDs (behaviour)

**Format:** `BK-H4K92R`. Spoken as two groups of three with phonetics: *"B-K, H for Hotel, four, K for Kilo — nine, two, R for Romeo."*

**It is a confirmation, not a password.** Lookup order:

1. Match on caller's phone → exactly one active booking? Read it back, confirm. **No ID needed.**
2. Multiple matches, or phone doesn't match (different handset, booked for someone else) → ask for the ID.
3. Lost the ID → verify on name + date, and offer to re-text it.

Never leave a customer unable to cancel. A customer who can't cancel becomes a no-show, which costs the shop a full slot.

**Rate limit:** 5 failed ID attempts per caller per 24h, then hand off to a human. Otherwise the ID space is brute-forceable over the phone.

Surfaces: SMS, email, calendar event title, dashboard Calendar/Clients/booking drawer, CSV and PDF exports.

---

## 7. Feature B — "That barber is fully booked"

### Target conversation

> **Caller:** "Skin fade with Tony on Saturday?"
> **AI:** "Let me check Tony's diary for Saturday… Tony's fully booked that day. Sam's got 2:30 and he does skin fades too — shall I put you in with Sam?"
> **Caller:** "No, I want Tony."
> **AI:** "No problem. Tony's earliest is Tuesday at 11. Does that work, or would you rather a different day?"
> **Caller:** "Neither."
> **AI:** "I can add you to Tony's waiting list for Saturday. If anyone cancels I'll text you, and the first person to reply gets it. Want me to do that?"

### The ladder

Runs in n8n against `barber_free_slots()`. **The agent never computes availability.**

```
requested barber + date + service duration
 ├─ free at the requested time?            → OFFER_EXACT
 ├─ free elsewhere that day, same barber?  → OFFER_SAME_DAY_SAME_BARBER   (up to 3)
 ├─ another barber free at that time?      → OFFER_OTHER_BARBER           (up to 2)
 ├─ requested barber free within 14 days?  → OFFER_NEXT_AVAILABLE         (earliest 3)
 └─ nothing                                → OFFER_WAITLIST
```

Steps 2 and 3 are ordered same-barber-first because barber loyalty beats time preference in a barber shop. **You asked for other-barber first — this is decision #2 in §15.** Swapping them is a one-line reorder.

Only barbers who actually perform the service are offered. That needs a `barber_services` join table (barber × service) — currently every barber is assumed to do everything, which will embarrass you the first time the AI offers a £45 highlights appointment with a barber who only does clippers.

### Response contract

```json
{
  "status": "OFFER_OTHER_BARBER",
  "requested": { "barber":"Tony","date":"2026-08-01","time":"14:00",
                 "service":"Skin Fade","duration":45 },
  "barber_fully_booked": true,
  "options": [
    {"id":"o1","type":"other_barber","barber":"Sam","start":"2026-08-01T14:30:00+01:00",
     "label":"Sam, Saturday 2:30pm"},
    {"id":"o2","type":"same_barber","barber":"Tony","start":"2026-08-04T11:00:00+01:00",
     "label":"Tony, Tuesday 11am"}
  ],
  "waitlist_available": true,
  "spoken": "Tony's fully booked on Saturday. Sam's got 2:30 that day and he does skin fades too — shall I put you in with Sam?"
}
```

The agent reads `spoken` and may **only** accept an `options[].id`. Hard prompt rule: *never state a time that is not in `options`.* This is the guardrail against the classic failure where the AI invents a slot and the customer turns up to a full shop.

---

## 8. Feature C — Waiting list (flow)

```
Cancellation (phone | dashboard | barber day-off)
        │
        ▼  Supabase DB webhook on appointments UPDATE, status → 'cancelled'
           (a DB webhook, not an n8n node, so EVERY cancellation path fires it)
        │
   POST /barber-slot-freed   [shared-secret header]
        ├─ slot in the past, or < min_notice away?   → stop, too late to refill
        ├─ insert barber_slot_offers (open, expires_at = now + waitlist_offer_minutes)
        │    └─ overlap constraint means a duplicate webhook can't double-open   ✅
        ├─ match_waitlist_for_slot(offer_id, waitlist_broadcast_size)
        ├─ insert one barber_offer_recipients row per match, each with its own token
        ├─ enqueue SMS to all of them at once (it's a race, not a queue)
        └─ audit_logs
        │
        ▼  customer taps the link
   GET /claim/:token   → claim_slot_offer(token)
        ├─ claimed      → confirmation page + SMS with booking ID
        │                 + create Google Calendar event
        │                 + notify the barber
        │                 + "sorry, gone" SMS to the other recipients
        ├─ already_used → show their existing booking (idempotent, not an error)
        ├─ too_late     → "someone beat you to it — you're still on the list"
        └─ invalid      → generic error, no information leaked
        │
        ▼  every 5 min: expire_stale_offers()
           └─ unclaimed → re-offer to the next batch, or release the slot
```

**Broadcast-to-5, first to claim wins** — which is what you asked for, and right for a barber shop where an unfilled same-day gap earns £0. Costs: four people get a "too late" text. Mitigated by capping at 5, warm wording, and dropping people after 4 unanswered offers. `shop_config.waitlist_mode = 'sequential'` exists for one-at-a-time if you'd rather.

**Joining by phone:** new intent `join_waitlist`, collected in one natural ask (name, service, barber-or-anyone, which days, morning/afternoon/evening), then confirmed back. Offered automatically at the end of the Feature B ladder.

**Dashboard — new Waiting List page:** table of who's waiting; live open-offer countdowns; manual "offer this slot to the waiting list" from any empty Calendar slot; bump priority; remove.

---

## 9. Feature D — Transparency, and Feature E — SMS

### 9.1 Procedural transparency

- Narrate before every lookup: *"Let me check Tony's diary, one second"* — kills the dead-air hang-up.
- Full readback + explicit yes before any write: *"Skin fade with Tony, Saturday the 1st at 2:30, 45 minutes, £18. Shall I book that?"*
- Say **why**: "Tony's fully booked", not "that's unavailable".
- Read the booking reference back and confirm receipt.
- Be honest about limits: no card payments, no price changes.
- Always offer a human: *"Would you rather speak to someone? I can have Faizan call you back."*
- Close with a summary + *"I've texted you the details."*

### 9.2 AI disclosure — needs your call (§15 #1)

The Global Node currently says *"Do NOT say you are an AI."* If transparency means disclosure, that line goes and the greeting becomes *"…I'm Jamie, the AI receptionist."*

**My recommendation: disclose.** If calls are recorded you must announce that anyway, so you're already opening with a disclosure sentence; adding three words costs nothing. And the downside risk is asymmetric — a customer who feels deceived complains publicly, whereas one told upfront generally just gets on with booking. It is your commercial call.

**Recording notice is not optional** if you store transcripts/recordings for the Usage feature: *"Calls are recorded for quality and training."* Store `consent_given`/`consent_at` on `call_logs`.

### 9.3 SMS provider: Twilio

Native n8n node, best UK deliverability, delivery-status webhooks, ~£0.04/SMS. (MessageBird is cheaper with weaker n8n support; Vonage is fine with more setup.)

**Sender identity:**

| Option | Cost | Replies? | Verdict |
|---|---|---|---|
| Alphanumeric sender `SkyWebBrb` | free | ❌ | **MVP** — pair with tap-to-claim links |
| UK virtual mobile | ~£1/mo | ✅ | add when customers try replying |
| Short code | £££ | ✅ | overkill |

**Tap-to-claim beats reply-Y**: no parsing of "yes"/"YES PLEASE"/"ok", works when someone has two offers outstanding, needs no inbound number. Decision #3 in §15.

### 9.4 Messages (each ≤ 2 SMS segments)

| Trigger | Copy |
|---|---|
| Booked | `SkyWeb Barbers: Booked! Skin Fade with Tony, Sat 1 Aug 2:30pm. Ref H4K-92R. Changes: 020 1234 5678` |
| Rescheduled | `SkyWeb Barbers: Moved to Tue 4 Aug 11:00am with Tony. Ref H4K-92R.` |
| Cancelled | `SkyWeb Barbers: Your appt Sat 1 Aug 2:30pm is cancelled. Ref H4K-92R. Rebook: 020 1234 5678` |
| 24h reminder | `SkyWeb Barbers: Reminder - Skin Fade with Tony tomorrow 2:30pm. Ref H4K-92R.` |
| **Waitlist offer** | `SkyWeb Barbers: Slot open - Tony, Sat 1 Aug 2:30pm. First to claim gets it: skyweb.uk/c/K7m2Pq (20 min)` |
| Waitlist won | `SkyWeb Barbers: It's yours! Tony, Sat 1 Aug 2:30pm. Ref H4K-92R.` |
| Waitlist lost | `SkyWeb Barbers: That one's gone, sorry - you're still on the list. I'll text when another opens.` |
| Joined list | `SkyWeb Barbers: You're on the list for Tony, afternoons next week. I'll text if a slot frees up.` |
| Barber notify | `New booking: Skin Fade, Sat 1 Aug 2:30pm, Ahmed 07700900123. Ref H4K-92R.` |

### 9.5 Compliance

- Transactional SMS about a booking the customer made: fine under PECR soft opt-in. **Marketing SMS is not** — never mix them.
- `clients.sms_opt_out boolean`, checked before every send. Honour STOP if you take the two-way number.
- **Quiet hours 21:00–08:00**: queue reminders for the morning. Exception: a waitlist offer for a slot happening *today* (a 7am text about a 9am slot is useful, not rude).
- E.164 only. Anything `normalise_uk_phone()` rejects goes to the review queue, never silently dropped.

### 9.6 Email

SMS primary for customers; **email stays primary for barbers and the owner** (threaded record, free). Decision #5 in §15 if you want email gone entirely.

---

## 10. Reliability & operations

This section is the difference between a demo and a product.

### 10.1 Idempotency

Every inbound webhook is assumed to be delivered more than once.

| Endpoint | Idempotency key |
|---|---|
| `/barber-slot-freed` | `source_appointment_id` + `slot_start`; the overlap constraint blocks a second open offer |
| `/barber-call-ended` | `call_id` unique index → `on conflict (call_id) do update` |
| `/claim/:token` | function returns `already_used`, not an error |
| `/sms-status` | `sms_sid` + status, last-write-wins |
| Booking create | `overlap` constraint + a client-supplied `request_id` on the voice tool call |

### 10.2 Notification outbox

Never send SMS inline from a booking flow — a Twilio timeout would fail the booking. Write to an outbox, drain it separately.

```sql
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null,                        -- sms | email
  template text not null,
  to_address text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending',       -- pending|sent|failed|dead|suppressed
  attempts integer not null default 0,
  last_error text,
  provider_id text,
  not_before timestamptz not null default now(),  -- quiet-hours deferral
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outbox_pending on public.notification_outbox (not_before)
  where status = 'pending';
```

Drain worker every minute: exponential backoff (1m, 5m, 30m, 2h), **dead** after 4 attempts, dead rows surface in the dashboard. A waitlist offer that fails to send must **not** consume the customer's offer slot — re-offer to the next person.

### 10.3 Error handling in n8n

- One **Error Workflow** attached to all four workflows → writes `automation_events` + emails/texts you.
- Every Gmail/Twilio/Calendar node: `onError: continueRegularOutput` so a notification failure can't kill a booking.
- Every Calendar read node: `alwaysOutputData: true` (an empty day currently kills the downstream chain — a known gotcha from V1).
- **Never** return a bare 500 to the voice agent. Always return a speakable fallback: *"I'm having trouble with the diary — let me take your number and have someone call you back."* A silent tool failure makes the agent hallucinate.
- Timeouts: 8s on the voice tool call (the caller is waiting), 30s on background work.

### 10.4 Google Calendar as a mirror

After the Phase 1 flip, Calendar writes are **best-effort**. If a write fails, the booking still stands and a `calendar_sync_pending` flag is set; a reconciliation job runs every 15 minutes and retries. A nightly drift check compares Calendar against `appointments` and reports mismatches. Calendar being down must never stop the phone from taking bookings.

### 10.5 Monitoring & alerting

| Alert | Condition | Route |
|---|---|---|
| Booking failures | any `outcome='failed'` | SMS to you, immediately |
| Webhook down | no successful `/barber-receptionist` execution in 6h during opening hours | SMS |
| Outbox dead letters | any row `status='dead'` | email, hourly digest |
| Waitlist stuck | offer `open` and `expires_at < now() - 10m` | email |
| Usage 80 / 90 / 100% | threshold cross | dashboard banner + email to shop |
| Calendar drift | nightly mismatch > 0 | email |
| Supabase/n8n uptime | external monitor (Better Stack / UptimeRobot) | SMS |

### 10.6 Environments, backups, rollback

- **Staging** = a Supabase branch + a second n8n workflow set + a Vercel preview. Every migration lands there first.
- Supabase PITR — **verify it is actually enabled on this plan tier**; on Free it is not. Plus a nightly `pg_dump` to object storage, and one **tested restore** before go-live. An untested backup is not a backup.
- Every migration has a written `-- ROLLBACK:` block.
- n8n workflow JSON exported to git on every change (currently a loose file on the Desktop — one bad edit and 102 nodes are gone).

### 10.7 Runbooks

`docs/RUNBOOK_SHOP.md` (for the barber, one page, plain English): how to add a barber, change hours, block a holiday, cancel for a customer, read the Usage page, what to do if the phone AI misbehaves, who to call.

`docs/RUNBOOK_SKYWEB.md` (for you): every alert above and its response; how to replay a failed webhook; how to reissue a waitlist offer manually; how to correct a double-booking; how to rotate Twilio/Google/Supabase keys; the GDPR-erasure procedure.

---

## 11. Security & compliance

### 11.1 Secrets
Service-role key in n8n env only — never in the dashboard bundle (grep `dist/` in CI). Twilio auth token in n8n credentials, not node parameters. Rotate quarterly; document the procedure. **Note:** `06-planning/skyweb-credentials.txt` currently holds live OpenAI/Figma/Meta tokens in plaintext on the Desktop — unrelated to this project but worth moving into a password manager.

### 11.2 Webhook auth
`/barber-slot-freed`, `/barber-call-ended`, `/sms-status` all require a shared-secret header, verified with a constant-time compare, and are rate-limited. `/claim/:token` is public by necessity: the token is the credential (128-bit, single-use, 20-minute expiry, no enumeration).

### 11.3 UK GDPR
- **Lawful basis:** contract (bookings) + legitimate interest (service SMS). Marketing needs separate opt-in.
- **Privacy notice** on the booking site and read on request by the AI.
- **Retention:** appointments 24 months, call recordings **90 days**, transcripts 12 months, waitlist entries 6 months after `date_to`. Implement as a nightly purge, not a policy nobody runs.
- **Erasure:** `gdpr_erase_customer(phone_e164)` — pseudonymises names/phones/emails across `appointments`, `clients`, `call_logs`, `barber_waitlist`; retains anonymised booking counts for accounts. Must complete within 30 days of request; document it in the runbook.
- **Processors:** DPAs on file for Supabase, Twilio, Google, Dograh, and the LLM provider. If transcripts go to an LLM, that provider is processing personal data — check its retention and training terms.
- **Recording consent** announced at call start.

### 11.4 Data residency — flag
This Supabase project is in **`ap-northeast-1` (Tokyo)**. UK customer personal data will sit in Japan. That is lawful with the right transfer mechanism (IDTA/UK addendum) but it is a question a savvy client will ask, and it's an odd answer for a UK barber shop. **Region cannot be changed after project creation** — moving means a new project and a data migration. Best done *before* the first client's data lands, i.e. now. This is decision-adjacent; see §16 item 9.

---

## 12. Build phases

| # | Phase | Days | Depends on |
|---|---|---|---|
| **0** | n8n → service-role key (§2A.1 #1) · RLS lockdown (§3) · loud-failure config fallbacks (D4) · data hygiene | 1–2 | — |
| **1** | Foundation: booking IDs (+ inverted write order, §2A.1 #5), overlap constraint, E.164, buffers, Postgres-authoritative availability, Calendar → mirror, **fix D1 (unattributed event blackholes the shop) and D3 (missing timezone offsets)** | 3–4 | 0 |
| **2** | SMS: Twilio, outbox, drain worker, quiet hours, opt-out, 12 Gmail nodes rewired | 2–3 | 1 |
| **3** | Booking IDs on the call: readback, ID-based lookup with phone fallback, rate limit, dashboard surfaces | 1–2 | 1, 2 |
| **4** | Alternatives ladder + `barber_services` + `options[]` contract + prompt rewrite — *reduced: same-day alternatives already exist (§2A.1 #6)* | 1–2 | 1 |
| **5** | Waiting list: tables, claim, matching, expiry, claim page, dashboard page | 3–4 | 1, 2 |
| **6** | Usage: call logging, `/barber-call-ended`, Usage page, package admin, threshold alerts | 3 | 1 |
| **7** | Hardening: error workflow, monitoring, runbooks, backup restore test, load test, go-live checklist | 2 | all |

**17–22 days.** Phases 4 and 6 can run in parallel. Phase 0 blocks everything.

---

## 13. Test results

### 13.1 Defects found and fixed during validation

These are the reason the SQL above is different from the SQL I'd have written without running it.

1. **`+44 (0)7700 900123` → `+4407700900123`.** The `(0)` trunk prefix survived and fell through to the generic international branch. Fixed with an explicit `^\+440` rule. Would have caused silent SMS delivery failures for every customer who writes their number that way.
2. **`gen_random_bytes` is not resolvable inside a `security definer` function.** pgcrypto lives in `extensions`, not `public`, so pinning `search_path = public` broke booking-ID generation **inside the waitlist claim path** — the error surfaced only when the claim function tried to insert an appointment. Fixed by fully qualifying `extensions.gen_random_bytes`. This would have taken down every booking in production and been very hard to diagnose.
3. **`position` is a reserved word in Postgres.** Using it as an OUT parameter name is a hard syntax error.
4. **Ambiguous OUT parameters.** `returns table (booking_id text, barber_name text)` collides with the identically-named columns being selected, producing a runtime ambiguity error. Fixed with `o_`-prefixed OUT names.
5. **`count(*)` over a `LEFT JOIN` reports 1 call on an empty account.** Fixed with `count(c.id)`.
6. **Untyped `NULL` in `RETURN QUERY`** fails type resolution. Every NULL is now explicitly cast.

Plus one testing lesson worth recording: my first expiry test asserted through a `UNION ALL` that mixed a mutating function with a count of its effect. Postgres may evaluate union branches in any order, so the test read as a failure when the function was fine. Sequential statements only, for anything with side effects.

### 13.2 Passing tests

| Area | Cases | Result |
|---|---|---|
| Booking ID generation | format, alphabet, uniqueness, banned chars | ✅ |
| Overlap constraint | overlap rejected · adjacent allowed · other barber allowed · cancelled slot reusable · reschedule-onto-occupied rejected | ✅ 5/5 |
| Constraint predicate `<> 'cancelled'` (revised per §2A.1 #2) | overlap rejected · **`completed` still blocks** (the old `IN (confirmed, rescheduled)` predicate would have permitted a double-booking here) · `cancelled` frees the slot | ✅ 3/3 |
| Phone normalisation | 15 inputs incl. trunk prefix, landline, international, junk | ✅ 15/15 |
| Availability | 45-min vs 20-min around buffers · **09:00 local in both BST and GMT** · closed Sunday · 2h min-notice | ✅ |
| Claim race | first wins · 2nd and 3rd `too_late` · winner re-tap `already_used` · bad token `invalid` · expired offer `too_late` · **phone booking wins the race → claim unwinds, no double-booking** | ✅ 7/7 |
| Offer overlap | second overlapping open offer rejected | ✅ |
| Matching | afternoon-only waiter skipped for 17:30 · rank order by join time · 20-min gap matches nobody waiting 45 min | ✅ |
| Expiry | `open → expired`, `offers_unanswered` incremented | ✅ |
| Billing rounding | 30/59/60/61/120/121/300s → 1/1/1/2/2/3/5 | ✅ 7/7 |
| Usage aggregate | 8 in-period calls, 16 min, AI/transferred/missed split, **BST period boundary** | ✅ |
| Empty period | reads 0, not 1 | ✅ |
| Final integrity | 0 double-booked pairs, 0 duplicate IDs, 0 banned chars | ✅ |

### 13.3 Still to test (needs the built system)

- **True concurrency:** 5 simultaneous HTTP claims against one offer, ×50 runs. Single-threaded logic is proven; this proves it under real parallel connections.
- **Load:** 20 concurrent calls hitting availability — confirm `barber_free_slots` stays under ~100ms (add an index on `appointments(barber_name, start_time)`).
- End-to-end voice: 12 scripted call scenarios (§14).
- Twilio: invalid number, opt-out, quiet-hours deferral, delivery-failure retry.
- Restore from backup into a fresh project.

---

## 14. Go-live gate

Nothing goes to a paying client until all of these are true.

**Security** — anon key returns 0 rows from `clients`; anon `DELETE` on `appointments` fails; no service-role key in `dist/`; all webhooks reject a bad secret; leaked-password protection on.
**Correctness** — concurrent-claim test 50/50 clean; zero overlapping appointments; DST date books correctly; every booking has an ID.
**Reliability** — error workflow fires; outbox retries and dead-letters; Calendar outage doesn't block bookings; backup restored successfully once.
**Voice** — 12 scenarios pass: book · book fully-booked barber → other barber · → next available · → waitlist · cancel with ID · cancel without ID · reschedule · lookup · wrong ID ×5 → handoff · outside hours · silence/no input · human handoff.
**SMS** — all 9 templates ≤ 2 segments, correct link, opt-out honoured, quiet hours deferred.
**Usage** — dashboard matches a hand-computed figure from 20 seeded calls; 80/90/100% alerts fire.
**Client-readiness** — no hardcoded shop name anywhere in `src/` **or in the n8n email HTML (D4)**; config fallbacks fail loudly instead of impersonating SkyWeb; logo served from Supabase Storage; `ONBOARD_A_CLIENT.md` walked end-to-end on a scratch project.
**Calendar isolation (D2)** — the workflow points at a dedicated shop calendar containing nothing but bookings; a personal event added to any other calendar provably does not affect availability; an event with no `Barber:` line blocks nobody (D1).
**No inline credentials** — zero `apikey`/`Authorization` header values in the workflow JSON; all Supabase auth via an n8n credential.
**Compliance** — privacy notice live; recording announcement in the greeting; retention job running; erasure function tested; DPAs filed.
**Docs** — both runbooks written; workflow JSON in git.

---

## 15. Decisions I need from you

| # | Decision | My recommendation |
|---|---|---|
| 1 | **Transparency**: procedural narration only, or also disclose that Jamie is an AI? | **Both.** You already need a recording announcement; disclosure costs three words and removes the "I was deceived" complaint. |
| 2 | **Alternatives order**: other barber first (as you said) or same-barber-different-time first? | **Same barber first.** Loyalty beats timing in a barber shop. One-line change either way. |
| 3 | **Two-way SMS now, or claim links only?** | **Claim links only for MVP.** Free, unambiguous, no number to rent. |
| 4 | **Does Dograh emit an end-of-call webhook with duration?** | Need to confirm — see §16 #4. Fallbacks cost ~1 day. |
| 5 | **Email: keep or drop?** | **Keep for barbers/owner, SMS-only for customers.** |
| 6 | **Offer window length?** | **20 minutes.** Shorter fills same-day gaps faster; longer catches people away from their phone. |
| 7 | **"300 calls or 1000 minutes" — capped on both (whichever runs out first), or one metric per plan?** | Built as `cap_mode='either'`. Confirm. |

---

## 16. What I need from you to finish this

Ordered by what blocks the most work.

1. **Answers to the seven decisions in §15.** #1, #2 and #7 change code; the rest change config. This is the biggest unblock — I can build Phases 0–3 with just these.

2. **Go-ahead on Phase 0 (the security fix).** It changes live RLS policies. The dashboard should keep working because it only reads, but I want your explicit OK before I touch production auth — and I'd like to run it on a Supabase branch first, which needs branching enabled on the project.

3. **Twilio account + a decision on the sender ID.** I need: account SID, auth token, and the alphanumeric sender registered (or the go-ahead to buy a UK number). Alphanumeric sender IDs in the UK need no registration but the string must be ≤11 chars — `SkyWebBrb` fits.

4. **Dograh specifics.** Either point me at the docs/dashboard for its webhooks, or confirm I may look: (a) does it POST an end-of-call report with `duration`, `call_id`, `ended_reason`, `recording_url`? (b) can a tool response carry structured JSON the agent reads, or is it string-only? (c) is call transfer to a human number supported on your plan? Answers to (a) and (b) shape Phases 4 and 6. If Dograh can't report duration, tell me and I'll spec the LiveKit-agent fallback instead.

5. ~~**n8n access for the live workflow.**~~ ✅ **RESOLVED 2026-07-27** — you supplied `Phase 0-8 (2).json` (108 nodes). Audit in §2A. I'd still like working n8n MCP/API access eventually so I can *apply* changes rather than hand you JSON, but it no longer blocks planning.

   **Two new asks that came out of that audit:**

   5a. **A dedicated Google Calendar for the shop** (defect D2). Every Calendar node currently points at your personal `faizanshahzad2002@gmail.com`. One dentist appointment on that account, combined with defect D1, makes the shop unbookable by phone. I need a fresh calendar the workflow owns exclusively, with no subscribed holiday/birthday calendars.

   5b. **Confirmation that I may use the service-role key in n8n** (§2A.1 #1). Phase 0 hinges on it. If you'd rather not put the service-role key in n8n, the alternative is a dedicated Postgres role with narrow grants plus a PostgREST JWT — more secure, roughly half a day extra. Tell me which you prefer.

10. **Which n8n instance and workflow is actually live?** (§2A.2b, blocks all workflow edits.) I can now read *and write* n8n directly, so I can apply Phases 1–6 myself instead of handing you JSON — but the workflow I can reach (`SthkpwXtbCXnffw1`) is **inactive, has zero credentials on all 31 Google nodes, and reports webhook URLs on a host I'm not connected to**. My notes have the barber workflow as `bP8xVmiwhdOafz60` on `n8n-production-7b4d`; the trigger URLs say `n8n-production-896f`; I'm connected somewhere that lists neither. Three candidates.

    What I need: **the exact webhook URL configured in the Dograh `manage_barber_appointment` tool.** That single string settles which host and which workflow serves live traffic, and I'll work only on that one. If the answer is "none of these are live and the barber agent isn't currently taking real calls", say so — that's genuinely good news, because it means Phase 0 and Phase 1 can be done without an outage window.

    Related: were the Google credentials ever attached on this instance, or is it a fresh import? If it's an import, add the 31-node credential re-stamp (D7) to Phase 0 — and note it must go through the API, not the UI, or the `operation`/`resource` discriminators get stripped.

6. **Real service durations and buffers.** The current 14 services include test junk and a £100 haircut. For a client launch I need the real menu: name, price, duration, clean-up buffer. Also **which barber does which service** — that's the `barber_services` table in §7 and I can't populate it by guessing.

7. **Real opening hours**, including whether the shop has a lunch break and how bank holidays are handled. Tue 17:58 / Wed 17:59 need to become real numbers.

8. **The claim-link domain.** `skyweb.uk/c/<token>` is a placeholder. I need a real short host (or a subdomain like `book.<client>.co.uk`) that can point at the n8n webhook — SMS length makes this worth getting short.

9. **A decision on data residency (§11.4).** The Supabase project is in **Tokyo**. Region is immutable, so if you want UK/EU hosting for UK customer data, it has to be a new project — and that is far cheaper to do now, with 32 test bookings, than after a client's customers are in there. My recommendation: **move to `eu-west-2` (London) before Phase 1.** Costs roughly half a day. Say the word and I'll fold it into Phase 0.

**Not blocking:** the client's real name, address, phone and logo. §4 makes all of that a config row you can hand me in five minutes whenever the client signs, and I'll build against the placeholder until then.
