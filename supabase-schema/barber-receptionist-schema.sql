-- ============================================================
-- BARBER RECEPTIONIST - Complete Supabase Schema
-- Run this on a fresh Supabase project to create all tables,
-- indexes, RLS policies, helper functions, and views.
-- ============================================================

-- Required extension for GiST range-overlap indexes
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 1. HELPER FUNCTIONS (used by RLS policies)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  select exists (
    select 1 from barbers
    where user_id = auth.uid() and role in ('admin','operator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  select exists (
    select 1 from barbers
    where user_id = auth.uid() and role = 'operator'
  );
$$;

-- ============================================================
-- 2. TABLES
-- ============================================================

-- ---------- shop_config ----------
CREATE TABLE public.shop_config (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                    text        NOT NULL DEFAULT 'SkyWeb Barbers Co',
  address                 text,
  phone                   text,
  shop_email              text,
  timezone                text        NOT NULL DEFAULT 'Europe/London',
  parking                 text,
  cancellation            text,
  payment                 text,
  hours_text              text,
  open_hours              jsonb       NOT NULL DEFAULT '{"1": ["09:00", "19:00"], "2": ["09:00", "19:00"], "3": ["09:00", "19:00"], "4": ["09:00", "19:00"], "5": ["09:00", "19:00"], "6": ["09:00", "17:00"], "7": null}',
  updated_at              timestamptz DEFAULT now(),
  slot_granularity_minutes integer    NOT NULL DEFAULT 15,
  lookahead_days          integer     NOT NULL DEFAULT 14,
  min_notice_minutes      integer     NOT NULL DEFAULT 120,
  waitlist_mode           text        NOT NULL DEFAULT 'broadcast',
  waitlist_broadcast_size integer     NOT NULL DEFAULT 5,
  waitlist_offer_minutes  integer     NOT NULL DEFAULT 20,
  quiet_hours_start       time        NOT NULL DEFAULT '21:00',
  quiet_hours_end         time        NOT NULL DEFAULT '08:00',
  sms_sender_id           text,
  logo_url                text,
  brand_primary_colour    text,
  website                 text,
  booking_url             text,
  legal_entity_name       text,
  ico_registration        text,
  alternatives_order      text        NOT NULL DEFAULT 'other_barber_first',

  CONSTRAINT shop_config_waitlist_mode_chk CHECK (waitlist_mode = ANY (ARRAY['broadcast','sequential'])),
  CONSTRAINT shop_config_alt_order_chk     CHECK (alternatives_order = ANY (ARRAY['other_barber_first','same_barber_first']))
);

-- ---------- barbers ----------
CREATE TABLE public.barbers (
  id         uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text    NOT NULL,
  email      text    NOT NULL UNIQUE,
  role       text    NOT NULL DEFAULT 'barber',
  active     boolean NOT NULL DEFAULT true,
  user_id    uuid,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT barbers_role_check CHECK (role = ANY (ARRAY['admin','barber','operator']))
);

-- ---------- services ----------
CREATE TABLE public.services (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name             text    NOT NULL,
  price            text    NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  active           boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  buffer_minutes   integer NOT NULL DEFAULT 5
);

-- ---------- barber_services (which barber offers which service) ----------
CREATE TABLE public.barber_services (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_name  text NOT NULL,
  service_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT barber_services_barber_name_service_name_key UNIQUE (barber_name, service_name)
);

-- ---------- clients ----------
CREATE TABLE public.clients (
  id          uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text    NOT NULL,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  phone_e164  text,
  sms_opt_out boolean NOT NULL DEFAULT false
);

-- ---------- appointments ----------
CREATE TABLE public.appointments (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calendar_event_id   text        UNIQUE,
  barber_name         text        NOT NULL,
  customer_name       text,
  customer_phone      text,
  customer_email      text,
  service_name        text,
  service_price       text,
  start_time          timestamptz NOT NULL,
  end_time            timestamptz NOT NULL,
  status              text        NOT NULL DEFAULT 'confirmed',
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  is_new_client       boolean     DEFAULT true,
  consent_given       boolean,
  consent_at          timestamptz,
  booking_id          text,
  source              text        NOT NULL DEFAULT 'ai',
  customer_phone_e164 text,

  CONSTRAINT appointments_status_check CHECK (status = ANY (ARRAY['confirmed','cancelled','rescheduled']))
);

-- ---------- call_logs ----------
CREATE TABLE public.call_logs (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_name      text,
  caller_phone     text,
  caller_email     text,
  intent           text,
  outcome          text,
  notes            text,
  created_at       timestamptz DEFAULT now(),
  call_id          text,
  direction        text    NOT NULL DEFAULT 'inbound',
  from_number      text,
  to_number        text,
  caller_phone_e164 text,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds integer,
  handled_by       text    NOT NULL DEFAULT 'ai',
  transferred_to   text,
  ended_reason     text,
  booking_id       text,
  recording_url    text,
  transcript       text,
  provider         text,
  provider_cost    numeric,
  consent_given    boolean,
  consent_at       timestamptz,
  billable_minutes integer,

  CONSTRAINT call_handled_by CHECK (handled_by = ANY (ARRAY['ai','transferred','voicemail','missed']))
);

-- ---------- barber_time_off ----------
CREATE TABLE public.barber_time_off (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_name         text,
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  reason              text,
  calendar_marker_id  text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT time_off_sane CHECK (ends_at > starts_at)
);

-- ---------- barber_waitlist ----------
CREATE TABLE public.barber_waitlist (
  id                       uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name            text    NOT NULL,
  customer_phone_e164      text    NOT NULL,
  customer_email           text,
  service_name             text    NOT NULL,
  service_duration_minutes integer NOT NULL,
  preferred_barber         text,
  any_barber               boolean NOT NULL DEFAULT false,
  date_from                date    NOT NULL,
  date_to                  date    NOT NULL,
  time_window              text    NOT NULL DEFAULT 'any',
  status                   text    NOT NULL DEFAULT 'waiting',
  priority                 integer NOT NULL DEFAULT 0,
  offers_sent              integer NOT NULL DEFAULT 0,
  offers_unanswered        integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz,

  CONSTRAINT waitlist_barber_choice CHECK (any_barber OR (preferred_barber IS NOT NULL)),
  CONSTRAINT waitlist_status        CHECK (status = ANY (ARRAY['waiting','offered','booked','expired','cancelled'])),
  CONSTRAINT waitlist_time_window   CHECK (time_window = ANY (ARRAY['morning','afternoon','evening','any'])),
  CONSTRAINT waitlist_window_sane   CHECK (date_to >= date_from)
);

-- ---------- barber_slot_offers ----------
CREATE TABLE public.barber_slot_offers (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_name            text        NOT NULL,
  slot_start             timestamptz NOT NULL,
  slot_end               timestamptz NOT NULL,
  source_appointment_id  uuid        REFERENCES appointments(id),
  status                 text        NOT NULL DEFAULT 'open',
  claimed_by_waitlist_id uuid        REFERENCES barber_waitlist(id),
  claimed_appointment_id uuid        REFERENCES appointments(id),
  claimed_at             timestamptz,
  opened_at              timestamptz NOT NULL DEFAULT now(),
  expires_at             timestamptz NOT NULL,

  CONSTRAINT slot_offer_sane   CHECK (slot_end > slot_start),
  CONSTRAINT slot_offer_status CHECK (status = ANY (ARRAY['open','claimed','expired','withdrawn']))
);

-- ---------- barber_offer_recipients ----------
CREATE TABLE public.barber_offer_recipients (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id     uuid NOT NULL REFERENCES barber_slot_offers(id),
  waitlist_id  uuid NOT NULL REFERENCES barber_waitlist(id),
  token        text NOT NULL UNIQUE,
  sent_at      timestamptz,
  sms_sid      text,
  sms_status   text,
  responded_at timestamptz,
  response     text,

  CONSTRAINT barber_offer_recipients_offer_id_waitlist_id_key UNIQUE (offer_id, waitlist_id)
);

-- ---------- notification_outbox ----------
CREATE TABLE public.notification_outbox (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel            text        NOT NULL,
  template           text        NOT NULL,
  to_address         text        NOT NULL,
  payload            jsonb       NOT NULL DEFAULT '{}',
  status             text        NOT NULL DEFAULT 'pending',
  attempts           integer     NOT NULL DEFAULT 0,
  last_error         text,
  provider_id        text,
  related_booking_id text,
  related_offer_id   uuid,
  not_before         timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  sent_at            timestamptz,

  CONSTRAINT outbox_channel CHECK (channel = ANY (ARRAY['sms','email'])),
  CONSTRAINT outbox_status  CHECK (status = ANY (ARRAY['pending','sent','failed','dead','suppressed']))
);

-- ---------- usage_packages ----------
CREATE TABLE public.usage_packages (
  id                 uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_name          text    NOT NULL,
  included_calls     integer,
  included_minutes   integer,
  cap_mode           text    NOT NULL DEFAULT 'either',
  period_start       date    NOT NULL,
  period_end         date    NOT NULL,
  overage_per_minute numeric NOT NULL DEFAULT 0,
  overage_per_call   numeric NOT NULL DEFAULT 0,
  monthly_price      numeric,
  timezone           text    NOT NULL DEFAULT 'Europe/London',
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pkg_cap_mode    CHECK (cap_mode = ANY (ARRAY['either','calls','minutes'])),
  CONSTRAINT pkg_period_sane CHECK (period_end > period_start)
);

-- ============================================================
-- 3. VIEW
-- ============================================================

CREATE OR REPLACE VIEW public.usage_current_period AS
SELECT
  p.id AS package_id,
  p.plan_name,
  p.period_start,
  p.period_end,
  p.included_calls,
  p.included_minutes,
  p.cap_mode,
  p.overage_per_minute,
  p.overage_per_call,
  count(c.id)                                                            AS calls_received,
  count(c.id) FILTER (WHERE c.handled_by = 'ai')                        AS calls_ai_handled,
  count(c.id) FILTER (WHERE c.handled_by = 'transferred')               AS calls_transferred,
  count(c.id) FILTER (WHERE c.handled_by = 'missed')                    AS calls_missed,
  count(c.id) FILTER (WHERE c.booking_id IS NOT NULL)                   AS calls_with_booking,
  COALESCE(sum(c.billable_minutes), 0::bigint)                          AS minutes_used,
  GREATEST(0::bigint, p.included_minutes - COALESCE(sum(c.billable_minutes), 0::bigint)) AS minutes_left,
  GREATEST(0::bigint, p.included_calls - count(c.id))                   AS calls_left,
  GREATEST(0::bigint, COALESCE(sum(c.billable_minutes), 0::bigint) - p.included_minutes) AS overage_minutes,
  round(COALESCE(avg(c.duration_seconds), 0::numeric))                  AS avg_seconds,
  max(c.duration_seconds)                                                AS longest_seconds
FROM usage_packages p
LEFT JOIN call_logs c
  ON c.started_at >= (p.period_start::timestamp AT TIME ZONE p.timezone)
 AND c.started_at <  (p.period_end::timestamp   AT TIME ZONE p.timezone)
WHERE p.active
GROUP BY p.id, p.plan_name, p.period_start, p.period_end,
         p.included_calls, p.included_minutes, p.cap_mode,
         p.overage_per_minute, p.overage_per_call;

-- ============================================================
-- 4. INDEXES
-- ============================================================

-- appointments
CREATE UNIQUE INDEX appointments_booking_id_key      ON public.appointments (booking_id);
CREATE INDEX idx_appointments_barber                  ON public.appointments (barber_name);
CREATE INDEX idx_appointments_start                   ON public.appointments (start_time);
CREATE INDEX idx_appointments_event_id                ON public.appointments (calendar_event_id);
CREATE INDEX appointments_phone_e164_idx              ON public.appointments (customer_phone_e164);
CREATE INDEX appointments_barber_start_idx            ON public.appointments (barber_name, start_time) WHERE status <> 'cancelled';
CREATE INDEX appointments_no_overlap                  ON public.appointments USING gist (barber_name, tstzrange(start_time, end_time, '[)')) WHERE status <> 'cancelled';

-- barber_services
CREATE INDEX barber_services_service_idx              ON public.barber_services (service_name, barber_name);

-- barber_slot_offers
CREATE INDEX slot_offers_expiry_idx                   ON public.barber_slot_offers (status, expires_at);
CREATE INDEX slot_offers_no_overlapping_open           ON public.barber_slot_offers USING gist (barber_name, tstzrange(slot_start, slot_end, '[)')) WHERE status = 'open';

-- barber_time_off
CREATE INDEX barber_time_off_lookup                   ON public.barber_time_off (barber_name, starts_at, ends_at);

-- barber_waitlist
CREATE INDEX waitlist_match_idx                       ON public.barber_waitlist (status, preferred_barber, date_from, date_to);

-- call_logs
CREATE UNIQUE INDEX call_logs_call_id_key             ON public.call_logs (call_id) WHERE call_id IS NOT NULL;
CREATE INDEX call_logs_started_at_idx                 ON public.call_logs (started_at DESC);

-- clients
CREATE INDEX clients_phone_e164_idx                   ON public.clients (phone_e164);

-- notification_outbox
CREATE INDEX outbox_pending_idx                       ON public.notification_outbox (not_before) WHERE status = 'pending';
CREATE INDEX outbox_dead_idx                          ON public.notification_outbox (created_at DESC) WHERE status = 'dead';

-- usage_packages
CREATE UNIQUE INDEX usage_packages_one_active         ON public.usage_packages (active) WHERE active;

-- ============================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.shop_config             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_services         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_time_off         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_waitlist         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_slot_offers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_offer_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_packages          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

-- shop_config
CREATE POLICY anon_read_shop_config          ON public.shop_config FOR SELECT TO anon          USING (true);
CREATE POLICY authenticated_read_shop_config ON public.shop_config FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_write_shop_config        ON public.shop_config FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- barbers
CREATE POLICY anon_read_barbers              ON public.barbers FOR SELECT TO anon          USING (true);
CREATE POLICY authenticated_read_barbers     ON public.barbers FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_write_barbers            ON public.barbers FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY auth_insert_barbers            ON public.barbers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_barbers            ON public.barbers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_barbers            ON public.barbers FOR DELETE TO authenticated USING (true);
CREATE POLICY barbers_no_self_promote        ON public.barbers FOR ALL    TO authenticated
  USING ((role <> 'operator') OR is_operator())
  WITH CHECK ((role <> 'operator') OR is_operator());

-- services
CREATE POLICY anon_read_services             ON public.services FOR SELECT TO anon          USING (true);
CREATE POLICY authenticated_read_services    ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_write_services           ON public.services FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY auth_insert_services           ON public.services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_services           ON public.services FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_services           ON public.services FOR DELETE TO authenticated USING (true);

-- barber_services
CREATE POLICY barber_services_read_auth      ON public.barber_services FOR SELECT TO authenticated USING (true);
CREATE POLICY barber_services_write_admin    ON public.barber_services FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- clients
CREATE POLICY clients_rw_auth               ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- appointments
CREATE POLICY anon_read_appointments         ON public.appointments FOR SELECT TO anon          USING (true);
CREATE POLICY authenticated_read_appointments ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY anon_write_appointments        ON public.appointments FOR ALL    TO anon          USING (true) WITH CHECK (true);
CREATE POLICY admin_write_appointments       ON public.appointments FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- call_logs
CREATE POLICY call_logs_read_auth            ON public.call_logs FOR SELECT TO authenticated USING (true);

-- barber_time_off
CREATE POLICY time_off_read_auth             ON public.barber_time_off FOR SELECT TO authenticated USING (true);
CREATE POLICY time_off_write_admin           ON public.barber_time_off FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- barber_waitlist
CREATE POLICY waitlist_read_auth             ON public.barber_waitlist FOR SELECT TO authenticated USING (true);
CREATE POLICY waitlist_write_auth            ON public.barber_waitlist FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- barber_slot_offers
CREATE POLICY offers_read_auth              ON public.barber_slot_offers FOR SELECT TO authenticated USING (true);

-- barber_offer_recipients
CREATE POLICY recipients_read_auth          ON public.barber_offer_recipients FOR SELECT TO authenticated USING (false);

-- notification_outbox
CREATE POLICY outbox_read_auth              ON public.notification_outbox FOR SELECT TO authenticated USING (true);

-- usage_packages
CREATE POLICY packages_read_auth            ON public.usage_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY packages_write_admin          ON public.usage_packages FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 7. BUSINESS LOGIC FUNCTIONS + TRIGGERS
--    (required by the n8n workflow — it calls get_shop_data
--     and find_booking_alternatives over PostgREST /rpc/)
-- ============================================================

-- ---------- Booking ID generator ----------
-- 6 chars from a 30-char alphabet with 0/O, 1/I/L and U removed. 729M combos.
-- CSPRNG (pgcrypto), rejection-sampled to remove modulo bias.
-- NOTE: extensions.gen_random_bytes is FULLY QUALIFIED — not optional.
CREATE OR REPLACE FUNCTION public.gen_booking_id() RETURNS text
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text; b int; i int; guard int := 0;
BEGIN
  LOOP
    guard := guard + 1;
    IF guard > 50 THEN RAISE EXCEPTION 'gen_booking_id: 50 collisions in a row'; END IF;
    code := ''; i := 0;
    WHILE i < 6 LOOP
      b := get_byte(extensions.gen_random_bytes(1), 0);
      IF b < 240 THEN                       -- 240 = 8*30, kills modulo bias
        code := code || substr(alphabet, 1 + (b % 30), 1);
        i := i + 1;
      END IF;
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.booking_id = code);
  END LOOP;
  RETURN code;
END $$;

CREATE OR REPLACE FUNCTION public.set_booking_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF new.booking_id IS NULL THEN new.booking_id := public.gen_booking_id(); END IF;
  RETURN new;
END $$;

-- Trigger-based, so EVERY write path gets an ID: phone, dashboard, waitlist, manual SQL
CREATE TRIGGER appointments_booking_id BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_id();

-- ---------- Waitlist offer token ----------
-- 22-char url-safe, 128-bit, no base64 padding (fits an SMS, survives a copy-paste)
CREATE OR REPLACE FUNCTION public.gen_offer_token() RETURNS text
LANGUAGE sql SET search_path = public, extensions AS $$
  SELECT rtrim(replace(replace(encode(extensions.gen_random_bytes(16),'base64'),'/','_'),'+','-'), '=')
$$;

-- ---------- Phone normalisation (US NANP + UK) ----------
-- A UK national number always starts 0; a NANP area code never starts 0 or 1,
-- so the two locales can be told apart without being told which.
CREATE OR REPLACE FUNCTION public.normalise_phone(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d text;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  d := regexp_replace(p, '[^0-9+]', '', 'g');

  IF    d ~ '^0044' THEN d := '+44' || substr(d, 5);
  ELSIF d ~ '^\+44' THEN d := '+44' || substr(d, 4);
  ELSIF d ~ '^44' AND length(d) >= 12 THEN d := '+44' || substr(d, 3);
  END IF;
  IF d ~ '^\+440' THEN d := '+44' || substr(d, 5); END IF;   -- "+44 (0)7700..."

  IF d ~ '^\+44[1-9][0-9]{8,9}$' THEN RETURN d; END IF;
  IF d ~ '^0[1-9][0-9]{8,9}$'    THEN RETURN '+44' || substr(d, 2); END IF;

  IF d ~ '^1[2-9]' AND length(d) = 11 THEN d := '+' || d; END IF;
  IF d ~ '^\+1[2-9][0-9]{9}$' THEN RETURN d; END IF;
  IF d ~ '^[2-9][0-9]{9}$'    THEN RETURN '+1' || d; END IF;

  IF d ~ '^\+[1-9][0-9]{7,14}$' THEN RETURN d; END IF;
  RETURN NULL;                                                -- → manual review queue
END $$;

-- E.164 columns are maintained by trigger, not just backfilled — otherwise every
-- NEW booking has NULL and SMS has no destination.
CREATE OR REPLACE FUNCTION public.normalise_appointment_phone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF new.customer_phone IS NOT NULL THEN
    new.customer_phone_e164 := normalise_phone(new.customer_phone);
  END IF;
  RETURN new;
END $$;

CREATE TRIGGER appointments_normalise_phone BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.normalise_appointment_phone();

CREATE OR REPLACE FUNCTION public.normalise_client_phone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF new.phone IS NOT NULL THEN
    new.phone_e164 := normalise_phone(new.phone);
  END IF;
  RETURN new;
END $$;

CREATE TRIGGER clients_normalise_phone BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.normalise_client_phone();

-- ---------- Availability engine ----------
-- Postgres-authoritative availability. Built as LOCAL wall-clock then converted,
-- so BST/GMT is handled by Postgres rather than by the caller.
CREATE OR REPLACE FUNCTION public.barber_free_slots(
  p_barber text, p_date date, p_duration_min integer,
  p_buffer_min integer DEFAULT 5, p_now timestamptz DEFAULT now()
) RETURNS TABLE (slot_start timestamptz, slot_end timestamptz)
LANGUAGE plpgsql STABLE
SET search_path = public, extensions
AS $$
DECLARE
  c shop_config; v_hours jsonb;
  v_open timestamptz; v_close timestamptz;
  v_step interval; v_dur interval; v_earliest timestamptz;
BEGIN
  SELECT * INTO c FROM shop_config LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'shop_config is empty'; END IF;

  v_hours := c.open_hours -> extract(isodow FROM p_date)::text;
  IF v_hours IS NULL OR jsonb_typeof(v_hours) = 'null' THEN RETURN; END IF;   -- closed

  v_open  := ((p_date::text || ' ' || (v_hours ->> 0))::timestamp) AT TIME ZONE c.timezone;
  v_close := ((p_date::text || ' ' || (v_hours ->> 1))::timestamp) AT TIME ZONE c.timezone;

  v_step     := make_interval(mins => c.slot_granularity_minutes);
  v_dur      := make_interval(mins => p_duration_min);
  v_earliest := p_now + make_interval(mins => c.min_notice_minutes);

  RETURN QUERY
  WITH candidate AS (
    SELECT g AS s, g + v_dur AS e
    FROM generate_series(v_open, v_close - v_dur, v_step) g
  )
  SELECT cd.s, cd.e FROM candidate cd
  WHERE cd.s >= v_earliest
    AND NOT EXISTS (                                 -- real booking (+ buffer both sides)
      SELECT 1 FROM appointments a
      WHERE a.barber_name = p_barber
        AND a.status <> 'cancelled'
        AND tstzrange(a.start_time - make_interval(mins => p_buffer_min),
                      a.end_time   + make_interval(mins => p_buffer_min), '[)')
            && tstzrange(cd.s, cd.e, '[)'))
    AND NOT EXISTS (                                 -- live waitlist hold
      SELECT 1 FROM barber_slot_offers o
      WHERE o.barber_name = p_barber AND o.status = 'open' AND o.expires_at > p_now
        AND tstzrange(o.slot_start, o.slot_end, '[)') && tstzrange(cd.s, cd.e, '[)'))
    AND NOT EXISTS (                                 -- barber holiday / shop closure
      SELECT 1 FROM barber_time_off t
      WHERE (t.barber_name = p_barber OR t.barber_name IS NULL)
        AND tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(cd.s, cd.e, '[)'))
  ORDER BY cd.s;
END $$;

-- ---------- get_shop_data ----------
-- Called by the n8n nodes "Fetch Shop Data" and "Fetch Shop Data For Reminder"
-- via POST /rest/v1/rpc/get_shop_data. Returns config + services + barbers.
CREATE OR REPLACE FUNCTION public.get_shop_data()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'config',   COALESCE((SELECT to_jsonb(c.*) FROM shop_config c LIMIT 1), '{}'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.sort_order)
                          FROM services s WHERE s.active = true), '[]'::jsonb),
    'barbers',  COALESCE((SELECT jsonb_agg(to_jsonb(b.*) ORDER BY b.name)
                          FROM barbers b WHERE b.active = true), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- ---------- find_booking_alternatives ----------
-- Called by the n8n node "Find Alternatives" via POST /rest/v1/rpc/find_booking_alternatives
-- with {p_barber, p_date, p_time, p_service}. Reuses barber_free_slots, so it inherits
-- DST-safety, buffer awareness and time-off handling. Ladder order follows
-- shop_config.alternatives_order.
CREATE OR REPLACE FUNCTION public.find_booking_alternatives(
  p_barber text,
  p_date   date,
  p_time   text,
  p_service text
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_cfg         shop_config;
  v_svc         services;
  v_duration    integer;
  v_buffer      integer;
  v_order       text;
  v_result      jsonb := '[]'::jsonb;
  v_same_day    jsonb;
  v_other       jsonb;
  v_next_days   jsonb;
  v_barber_busy boolean := false;
  v_requested   timestamptz;
  v_slot        record;
  v_d           date;
BEGIN
  SELECT * INTO v_cfg FROM shop_config LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'no config'); END IF;

  SELECT * INTO v_svc FROM services WHERE name = p_service AND active LIMIT 1;
  v_duration := COALESCE(v_svc.duration_minutes, 30);
  v_buffer   := COALESCE(v_svc.buffer_minutes, 5);
  v_order    := COALESCE(v_cfg.alternatives_order, 'other_barber_first');

  v_requested := ((p_date::text || ' ' || p_time)::timestamp) AT TIME ZONE v_cfg.timezone;

  -- barber_fully_booked drives the wording: saying "Sam is fully booked Tuesday"
  -- when Sam is busy for one 35-minute window is a false statement to a customer.
  IF NOT EXISTS (
    SELECT 1 FROM barber_free_slots(p_barber, p_date, v_duration, v_buffer) LIMIT 1
  ) THEN
    v_barber_busy := true;
  END IF;

  -- Step 1: same barber, same day, different times
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'barber', p_barber,
    'date', p_date,
    'slot_start', fs.slot_start,
    'slot_end', fs.slot_end,
    'when', to_char(fs.slot_start AT TIME ZONE v_cfg.timezone, 'HH12:MIam')
  ) ORDER BY fs.slot_start), '[]'::jsonb)
  INTO v_same_day
  FROM barber_free_slots(p_barber, p_date, v_duration, v_buffer) fs
  WHERE fs.slot_start <> v_requested
  LIMIT 3;

  -- Step 2: other barbers who actually do this service, at the requested time
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'barber', ob.name,
    'date', p_date,
    'slot_start', fs.slot_start,
    'slot_end', fs.slot_end,
    'when', to_char(fs.slot_start AT TIME ZONE v_cfg.timezone, 'HH12:MIam'),
    'does_service', true
  ) ORDER BY ob.name), '[]'::jsonb)
  INTO v_other
  FROM barbers ob
  JOIN barber_services bs ON bs.barber_name = ob.name AND bs.service_name = p_service
  CROSS JOIN LATERAL (
    SELECT * FROM barber_free_slots(ob.name, p_date, v_duration, v_buffer) f
    WHERE f.slot_start <= v_requested AND f.slot_end > v_requested
    LIMIT 1
  ) fs
  WHERE ob.active AND ob.name <> p_barber;

  -- Step 3: preferred barber, scan forward across the lookahead window
  v_next_days := '[]'::jsonb;
  FOR v_d IN SELECT d FROM generate_series(p_date + 1, p_date + v_cfg.lookahead_days, '1 day'::interval) d LOOP
    SELECT jsonb_build_object(
      'barber', p_barber,
      'date', v_d,
      'slot_start', fs.slot_start,
      'slot_end', fs.slot_end,
      'when', to_char(v_d, 'FMDay FMDDth Mon') || ' ' || to_char(fs.slot_start AT TIME ZONE v_cfg.timezone, 'HH12:MIam')
    ) INTO v_slot
    FROM barber_free_slots(p_barber, v_d, v_duration, v_buffer) fs
    LIMIT 1;

    IF v_slot IS NOT NULL THEN
      v_next_days := v_next_days || v_slot;
      EXIT WHEN jsonb_array_length(v_next_days) >= 3;
    END IF;
  END LOOP;

  IF v_order = 'other_barber_first' THEN
    v_result := v_other || v_same_day || v_next_days;
  ELSE
    v_result := v_same_day || v_other || v_next_days;
  END IF;

  RETURN jsonb_build_object(
    'barber_fully_booked', v_barber_busy,
    'requested_barber', p_barber,
    'requested_date', p_date,
    'requested_time', p_time,
    'service', p_service,
    'alternatives', v_result
  );
END $$;

-- ---------- Waiting list: the atomic claim ----------
-- A single guarded UPDATE is atomic in Postgres: concurrent transactions serialise
-- on the row lock, the losers re-evaluate status='open', see it is false, and match
-- zero rows. No advisory locks, no application mutex, no window for two winners.
CREATE OR REPLACE FUNCTION public.claim_slot_offer(p_token text)
RETURNS TABLE (o_result text, o_booking_id text, o_barber text,
               o_slot_start timestamptz, o_slot_end timestamptz,
               o_service text, o_customer text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rcp barber_offer_recipients; v_offer barber_slot_offers;
  v_wl barber_waitlist;          v_appt appointments;
BEGIN
  SELECT * INTO v_rcp FROM barber_offer_recipients r WHERE r.token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, null::text, null::text,
                        null::timestamptz, null::timestamptz, null::text, null::text;
    RETURN;
  END IF;

  -- idempotent: the winner tapping their own link twice sees their booking, not an error
  IF v_rcp.response = 'claimed' THEN
    SELECT * INTO v_offer FROM barber_slot_offers o WHERE o.id = v_rcp.offer_id;
    SELECT * INTO v_appt  FROM appointments a WHERE a.id = v_offer.claimed_appointment_id;
    RETURN QUERY SELECT 'already_used'::text, v_appt.booking_id, v_appt.barber_name,
                        v_appt.start_time, v_appt.end_time, v_appt.service_name, v_appt.customer_name;
    RETURN;
  END IF;

  -- ===== THE ATOMIC GATE =====
  UPDATE barber_slot_offers o
     SET status = 'claimed', claimed_by_waitlist_id = v_rcp.waitlist_id, claimed_at = now()
   WHERE o.id = v_rcp.offer_id AND o.status = 'open' AND o.expires_at > now()
  RETURNING o.* INTO v_offer;

  IF NOT FOUND THEN                              -- someone else won, or it expired
    UPDATE barber_offer_recipients r SET responded_at = now(), response = 'too_late'
      WHERE r.id = v_rcp.id AND r.response IS NULL;
    RETURN QUERY SELECT 'too_late'::text, null::text, null::text,
                        null::timestamptz, null::timestamptz, null::text, null::text;
    RETURN;
  END IF;

  SELECT * INTO v_wl FROM barber_waitlist w WHERE w.id = v_rcp.waitlist_id;

  BEGIN
    INSERT INTO appointments (barber_name, customer_name, customer_phone, customer_phone_e164,
                             customer_email, service_name, service_price,
                             start_time, end_time, status, source, notes)
    SELECT v_offer.barber_name, v_wl.customer_name, v_wl.customer_phone_e164,
           v_wl.customer_phone_e164, v_wl.customer_email, v_wl.service_name, s.price,
           v_offer.slot_start, v_offer.slot_end, 'confirmed', 'waitlist',
           'Claimed from waiting list'
      FROM (SELECT price FROM services WHERE name = v_wl.service_name LIMIT 1) s
    RETURNING * INTO v_appt;
  EXCEPTION WHEN exclusion_violation THEN
    -- a phone caller took the slot in the same instant: unwind cleanly.
    -- Without the overlap index this branch could never fire and a double-booking
    -- would silently succeed. The constraint and this function are one design.
    UPDATE barber_slot_offers o SET status='withdrawn',
           claimed_by_waitlist_id=null, claimed_at=null WHERE o.id = v_offer.id;
    UPDATE barber_offer_recipients r SET responded_at=now(), response='too_late'
      WHERE r.id = v_rcp.id;
    RETURN QUERY SELECT 'too_late'::text, null::text, null::text,
                        null::timestamptz, null::timestamptz, null::text, null::text;
    RETURN;
  END;

  UPDATE barber_slot_offers o SET claimed_appointment_id = v_appt.id WHERE o.id = v_offer.id;
  UPDATE barber_waitlist   w SET status = 'booked'       WHERE w.id = v_wl.id;
  UPDATE barber_offer_recipients r SET responded_at = now(), response = 'claimed'
    WHERE r.id = v_rcp.id;
  UPDATE barber_offer_recipients r SET responded_at = now(), response = 'too_late'
    WHERE r.offer_id = v_offer.id AND r.id <> v_rcp.id AND r.response IS NULL;

  RETURN QUERY SELECT 'claimed'::text, v_appt.booking_id, v_appt.barber_name,
                      v_appt.start_time, v_appt.end_time, v_appt.service_name, v_appt.customer_name;
END $$;

-- ---------- Waiting list: matching ----------
-- NB: the rank column is "offer_rank", not "position" — position is a reserved word.
CREATE OR REPLACE FUNCTION public.match_waitlist_for_slot(p_offer_id uuid, p_limit int DEFAULT 5)
RETURNS TABLE (waitlist_id uuid, customer_name text, phone_e164 text,
               wl_service text, offer_rank int)
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE o barber_slot_offers; tz text; local_start timestamp; slot_min int;
BEGIN
  SELECT * INTO o FROM barber_slot_offers x WHERE x.id = p_offer_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT s.timezone INTO tz FROM shop_config s LIMIT 1;
  local_start := o.slot_start AT TIME ZONE tz;
  slot_min    := extract(epoch FROM (o.slot_end - o.slot_start)) / 60;

  RETURN QUERY
  SELECT w.id, w.customer_name, w.customer_phone_e164, w.service_name,
         row_number() OVER (ORDER BY w.priority DESC, w.created_at ASC)::int
  FROM barber_waitlist w
  WHERE w.status = 'waiting'
    AND (w.expires_at IS NULL OR w.expires_at > now())
    AND (w.any_barber OR w.preferred_barber = o.barber_name)
    AND local_start::date BETWEEN w.date_from AND w.date_to
    AND w.service_duration_minutes <= slot_min    -- a 20-min gap is not a 45-min skin fade
    AND w.offers_unanswered < 4                   -- stop pestering the unresponsive
    AND CASE w.time_window
          WHEN 'morning'   THEN local_start::time <  '12:00'
          WHEN 'afternoon' THEN local_start::time >= '12:00' AND local_start::time < '17:00'
          WHEN 'evening'   THEN local_start::time >= '17:00'
          ELSE true END
    AND NOT EXISTS (SELECT 1 FROM barber_offer_recipients r
                    WHERE r.offer_id = o.id AND r.waitlist_id = w.id)
  ORDER BY w.priority DESC, w.created_at ASC
  LIMIT p_limit;
END $$;

-- ---------- Waiting list: expiry ----------
-- Losers of a race return to 'waiting' so they stay matchable — otherwise losing a
-- single race silently removes a customer from the waiting list permanently.
CREATE OR REPLACE FUNCTION public.expire_stale_offers() RETURNS integer
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH done AS (
    UPDATE barber_slot_offers o SET status='expired'
     WHERE o.status='open' AND o.expires_at <= now() RETURNING o.id),
  bumped AS (
    UPDATE barber_offer_recipients r SET response='no_response', responded_at=now()
     WHERE r.offer_id IN (SELECT id FROM done) AND r.response IS NULL
    RETURNING r.waitlist_id)
  UPDATE barber_waitlist w
     SET offers_unanswered = w.offers_unanswered + 1,
         status = CASE WHEN w.status='offered' THEN 'waiting' ELSE w.status END
   WHERE w.id IN (SELECT waitlist_id FROM bumped);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ============================================================
-- DONE. Schema, indexes, RLS, functions and triggers are ready.
--
-- NEXT STEP — the database is empty and the workflow needs seed data:
--   1. ONE row in shop_config  (name, address, phone, timezone, open_hours)
--   2. Rows in barbers         (name, email, role)
--   3. Rows in services        (name, price, duration_minutes, buffer_minutes)
--   4. Rows in barber_services (which barber does which service)
-- Without a shop_config row, barber_free_slots() raises 'shop_config is empty'
-- and no booking can be made.
-- ============================================================
