# SkyWeb Operations Runbook — Barber Receptionist

Internal. For diagnosing and fixing the system, not for the client.

**Current stack (2026-07-27)**

| Piece | Where |
|---|---|
| n8n | `https://n8n-production-896f.up.railway.app` (Railway project `mindful-spontaneity`) |
| Workflow | `SkyWeb Barber AI Receptionist - Phase 0-8`, id `HOnNWmj5EO2XvEm6`, 112 nodes |
| Supabase | `ai-receptionist` / `eatpsykqvqtncdrvsqnc` (**ap-northeast-1, Tokyo**) |
| Voice | Dograh, tool `manage_barber_appointment` |
| Dashboard | Vite/React, port 5174 locally |
| Webhooks | `/skyweb-barber-basic` (voice), `/barber-shop-data` (agent variables) |

---

## ⚠️ Read this first

**n8n has no persistent storage.** No volume, no `DB_TYPE` — it runs SQLite on the
container's ephemeral disk. **Any redeploy wipes every workflow and credential**, and
Railway's image auto-update can trigger that with nobody touching anything.

This is the root cause of the historical "it just stopped working" reports.

Until it's fixed:
- Export the workflow JSON after every change
- Expect to re-import and re-attach credentials after any deploy
- Treat auto-updates as an outage waiting to happen

Fix: Postgres via `DB_*`, or a volume at `/home/node/.n8n`, plus an explicit
`N8N_ENCRYPTION_KEY` set **before** any credential exists.

---

## Symptom → cause

### "The AI says we're fully booked when we're not"
Historically caused by defect **D1** — a calendar event without a `Barber:` line in its
description marked every barber busy. **Fixed 2026-07-27.** If it recurs, check
`unattributedEvents` in the `Check Slot + Alternatives` output: it lists events the
workflow couldn't attribute. They no longer block anything, but a long list means the
shop calendar has junk on it.

### "Bookings stopped syncing to the dashboard"
Check the credential situation first (see the warning above). Then check `Sync Booking Create`
— since Phase 3 it runs **before** the calendar node and its failure output routes to
`Respond - Slot Taken`.

Note: PostgREST returns **400** for an overlap-constraint violation, and 400 is also what a
malformed body returns. So a genuine request bug currently surfaces to the caller as
"that slot's taken". If reports don't match reality, check the n8n execution log.

### "A customer got double-booked"
Shouldn't be possible — there's an `EXCLUDE` constraint on `appointments`. If it happened,
the constraint was dropped or the row has `status='cancelled'`. Check:
```sql
select conname from pg_constraint where conname = 'appointments_no_overlap';
```

### "The AI introduced itself as SkyWeb to a client's customer"
Defect **D4**, fixed. `Normalize + Validate Request` no longer falls back to SkyWeb's name
or email. If it recurs, look for `configDegraded: true` in the execution output — that
means `Fetch Shop Data` failed and the shop config never loaded.

### "Google OAuth won't connect"
Almost always the redirect URI. Two known causes:
1. `N8N_EDITOR_BASE_URL` / `WEBHOOK_URL` set **without** `https://` → Google returns a
   confusing `invalid_request` / "doesn't comply with OAuth 2.0 policy".
2. The exact callback URL isn't in the OAuth client's authorised list → `redirect_uri_mismatch`.

Click **error details** on Google's page — it shows the exact `redirect_uri` it received.

### "Usage shows zero calls"
Expected until call logging is built. Nothing writes to `call_logs` yet.

---

## Procedures

### Reattach credentials after a wipe
Use the API, never the UI — the UI strips `resource`/`operation` discriminators.
`setNodeCredential` for all 31 Google nodes, then verify:
- 12 Gmail nodes → `resource: message`, `operation: send`
- Calendar nodes → `resource: event`; the two create nodes → `operation: create`
  (**not** `resource: calendar` — that only supports the `availability` operation and
  would silently stop event creation. n8n's own validator gets this wrong.)

### Manually offer a freed slot to the waiting list
```sql
select public.open_slot_offer('<appointment_uuid>');
```
Returns `{opened, offer_id, recipients, expires_at}`, or a reason it declined
(`too_soon`, `offer_already_open`, `no_matching_waiters`).

### Expire stuck offers
```sql
select public.expire_stale_offers();
```
Should be on a 5-minute schedule once the n8n side is built.

### Correct a double-booking
Cancel the later one. Cancelling automatically opens the slot to the waiting list.

### Rotate keys
- **Supabase service_role** — rotate in Supabase, update the n8n credential. Never put it
  in the dashboard bundle. Check with: `grep -r "service_role" dist/` (must be empty).
- **`N8N_ENCRYPTION_KEY`** — **never rotate.** Every stored credential becomes
  undecryptable.
- **Google client secret** — reset in Cloud Console, update all three n8n credentials.

### GDPR erasure request
Pseudonymise across `appointments`, `clients`, `call_logs`, `barber_waitlist`.
Must complete within 30 days. Retain anonymised booking counts for accounts.

---

## Gotchas that have already cost time

- **`REVOKE ... FROM anon` on a function does nothing on its own.** Postgres grants
  `EXECUTE` to `PUBLIC` by default and anon inherits it. Always `REVOKE FROM PUBLIC` first.
  This left `claim_slot_offer` world-callable until 2026-07-27.
- **`gen_booking_id` must stay publicly executable.** The `BEFORE INSERT` trigger runs as
  the inserting role, so revoking it breaks every booking.
- **Views bypass RLS by default.** Set `security_invoker = true` or a view will leak the
  table it reads.
- **pgcrypto lives in `extensions`, not `public`.** Any `security definer` function with a
  pinned `search_path` must call `extensions.gen_random_bytes(...)` fully qualified.
- **`position` is a reserved word** in Postgres — can't be an OUT parameter name.
- **`count(*)` over a LEFT JOIN returns 1 for an empty group.** Use `count(col)`.
- **`get_workflow_details` never returns the `credentials` field** — you cannot verify
  credential attachment through the API. Check in the UI.
- **n8n paths with spaces** break `npm --prefix`; use a `.bat` wrapper (see
  `~/.claude/barber-dev.bat`).

---

## Known open risks

| Risk | Impact |
|---|---|
| **No n8n persistence** | Any redeploy loses all workflow work |
| **Supabase in Tokyo, n8n in California, callers in the UK** | Two trans-Pacific hops per tool call; poor voice latency |
| **Railway credit** | Was $4.33 / 26 days on 2026-07-27. If it runs out, the phone stops being answered |
| **`appointments` still anon-writable** | Pending the service-role swap |
| **Shop calendar is a personal Gmail** | Personal events pollute availability |
| **dental / physio tables** | Same non-enforcing RLS, including patient data — see the separate task |
