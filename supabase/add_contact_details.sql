-- Where people live, who they are, and what they are looking for.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- WHY THIS EXISTS
-- The CRM was built around a lead list: a name, a way to reach them, a stage
-- and a follow-up date. That is enough to work a pipeline and nothing more.
-- BoldTrail's per-contact record carries 83 fields, and the ones below are the
-- ones an estate agent actually acts on — you cannot match a buyer to a listing
-- without knowing the area they want and the price they buy at, and you cannot
-- sort a list by state if the state only exists inside a JSON blob.
--
-- Everything here is still kept verbatim in `external_raw` as well. These
-- columns exist so the data can be filtered, sorted and shown — promoting a
-- field out of the blob is what makes it usable, which is the same rule
-- `add_contact_enrichment.sql` followed.

-- ─── Where they are ──────────────────────────────────────────────────────────
alter table public.contacts add column if not exists address   text;
alter table public.contacts add column if not exists city      text;
alter table public.contacts add column if not exists state     text;
alter table public.contacts add column if not exists zip_code  text;

-- ─── Who they are ────────────────────────────────────────────────────────────
alter table public.contacts add column if not exists company       text;
alter table public.contacts add column if not exists job_title     text;
alter table public.contacts add column if not exists birthday      date;
alter table public.contacts add column if not exists second_email  text;
alter table public.contacts add column if not exists spouse_name   text;
alter table public.contacts add column if not exists spouse_email  text;
alter table public.contacts add column if not exists spouse_phone  text;

-- ─── What they are looking for ───────────────────────────────────────────────
-- BoldTrail derives these from what the person actually browsed, which makes
-- them the most useful fields in the whole record for matching a buyer to a
-- listing. numeric, not integer: avg_baths is routinely 2.5.
alter table public.contacts add column if not exists avg_price numeric;
alter table public.contacts add column if not exists avg_beds  numeric;
alter table public.contacts add column if not exists avg_baths numeric;

-- ─── How they arrived, and how warm they are ─────────────────────────────────
alter table public.contacts add column if not exists capture_method text;
alter table public.contacts add column if not exists referrer       text;
alter table public.contacts add column if not exists last_visit_at  timestamptz;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- Only the two that answer a real question: "who do I know in this area" and
-- "who is looking around this price". The rest are display fields and an index
-- on them would cost writes for nothing.
create index if not exists contacts_city_state_idx
  on public.contacts (state, city)
  where city is not null or state is not null;

create index if not exists contacts_avg_price_idx
  on public.contacts (avg_price)
  where avg_price is not null;

-- ─── Verify ──────────────────────────────────────────────────────────────────
--   select count(*) filter (where state is not null)  as with_state,
--          count(*) filter (where city is not null)   as with_city,
--          count(*) filter (where avg_price is not null) as with_price,
--          count(*) as total
--     from public.contacts;
