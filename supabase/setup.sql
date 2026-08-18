-- ═══════════════════════════════════════════════════════════════════════════
--  Admin panel — complete database setup
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Paste this whole file into the Supabase SQL editor and run it. That is the
-- entire procedure. It is idempotent: every statement is guarded, so running it
-- twice does nothing the second time, and running it against a database that is
-- already up to date is a no-op.
--
-- WHY ONE FILE
-- This replaces a directory of ad-hoc migrations that had to be applied in the
-- right order by hand. That worked while there was one of them. By the eighth,
-- "which of these has actually been run on production" was not answerable from
-- the repository, and /api/campaigns had been returning 500 in production
-- because one file in the middle of the list was never run. A single re-runnable
-- file cannot develop that problem: there is no order to get wrong and no subset
-- to forget.
--
-- ORDER WITHIN THE FILE IS STILL LOAD-BEARING. `contacts` must exist before
-- columns are added to it, `touch_updated_at` before any trigger uses it, and
-- the stage back-fill must sit between dropping the old CHECK constraint and
-- adding the new one. The sections are in dependency order; do not rearrange.
--
-- NOT INCLUDED, deliberately:
--   • schema.sql — documentation of the tables this database shares with the
--     main website (blogs, properties, contact_submissions). Nothing to run.
--   • The old blog_posts → blogs migration. It ended in DROP TABLE, it has
--     already run, and blog_posts no longer exists. A destructive one-shot does
--     not belong in a file whose whole promise is that re-running it is safe.
--     It is in git history if it is ever needed again.


-- ═══════════════════════════════════════════════════════════════════════════
--  1. Foundations
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- Used by the triggers on contacts, sync_state, campaigns and testimonials.
-- Defined once here rather than repeated in each section.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
--  2. contacts — the CRM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY A NEW TABLE, NOT contact_submissions
-- `contact_submissions` is an event log: "someone submitted a form at 3pm".
-- A CRM row is a *person* with a lifecycle, and one person can submit three
-- times. Stages, notes and follow-up dates belong to the person, not to any one
-- submission. So submissions stay as the immutable record of what came in, and
-- `contacts` is the working list Steven actually manages. A submission is linked
-- to the contact it produced via contacts.submission_id.

create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),

  first_name    text,
  last_name     text,
  email         text,
  phone         text,

  -- What they are to the business.
  lead_type     text not null default 'unknown',
  -- Where they are in the pipeline. See section 2d for the vocabulary.
  stage         text not null default 'new_lead',
  -- How they reached us: 'website', 'csv', 'boldtrail', 'manual', or free text.
  source        text,
  tags          text[] not null default '{}',

  -- Follow-up. `next_follow_up` is the whole point of the tool: it drives the
  -- "due" list that tells Steven who to call today.
  next_follow_up    date,
  last_contacted_at timestamptz,
  notes             text,

  -- Provenance. `raw` keeps the original CSV row verbatim, so a bad column
  -- mapping can be re-derived later instead of re-importing from scratch.
  submission_id uuid references public.contact_submissions (id) on delete set null,
  raw           jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ─── 2a. Fields promoted out of the BoldTrail record ────────────────────────
--
-- BoldTrail's per-contact record carries 83 fields and its CSV export 100+.
-- Everything is kept verbatim in `external_raw` / `raw` regardless, so nothing
-- is lost by leaving a field there — a column only earns its place when Steven
-- needs to filter, sort or act on it. You cannot match a buyer to a listing
-- without the area and price they buy at, and you cannot sort a list by state if
-- the state only exists inside a JSON blob.
--
-- `email_opt_in` is the one that is not a convenience. This app sends campaigns,
-- and mailing someone who opted out is a legal problem rather than an untidy
-- one. It has to be queryable before the first send, not after.

alter table public.contacts add column if not exists rating            smallint;
alter table public.contacts add column if not exists email_opt_in      boolean;
alter table public.contacts add column if not exists assigned_agent    text;
-- BoldTrail calls this "registered date": when the lead first appeared over
-- there, which is older than our `created_at` for anything imported.
alter table public.contacts add column if not exists first_seen_at     timestamptz;
alter table public.contacts add column if not exists last_closing_date date;
alter table public.contacts add column if not exists homeowner_status  text;

-- Where they are.
alter table public.contacts add column if not exists address   text;
alter table public.contacts add column if not exists city      text;
alter table public.contacts add column if not exists state     text;
alter table public.contacts add column if not exists zip_code  text;

-- Who they are.
alter table public.contacts add column if not exists company       text;
alter table public.contacts add column if not exists job_title     text;
alter table public.contacts add column if not exists birthday      date;
alter table public.contacts add column if not exists second_email  text;
alter table public.contacts add column if not exists spouse_name   text;
alter table public.contacts add column if not exists spouse_email  text;
alter table public.contacts add column if not exists spouse_phone  text;

-- What they are looking for. BoldTrail derives these from what the person
-- actually browsed, which makes them the most useful fields in the whole record
-- for matching a buyer to a listing. numeric, not integer: avg_baths is
-- routinely 2.5.
alter table public.contacts add column if not exists avg_price numeric;
alter table public.contacts add column if not exists avg_beds  numeric;
alter table public.contacts add column if not exists avg_baths numeric;

-- How they arrived, and how warm they are.
alter table public.contacts add column if not exists capture_method text;
alter table public.contacts add column if not exists referrer       text;
alter table public.contacts add column if not exists last_visit_at  timestamptz;

do $$ begin
  alter table public.contacts add constraint contacts_rating_check
    check (rating is null or rating between 0 and 5);
exception when duplicate_object then null;
end $$;


-- ─── 2b. lead_type / deal_types — BoldTrail's vocabulary ────────────────────
--
-- The original list — buyer / seller / investor / both / unknown — was invented
-- before there was anything to match it against. BoldTrail's `deal_type` uses
-- buyer / seller / renter / vendor / agent, and importing into the old list
-- meant "vendor" and "agent" collapsed to "unknown" and everything with more
-- than one role collapsed to "both".
--
-- WHY BOTH A SINGLE VALUE AND AN ARRAY
-- Their deal_type is multi-valued — "buyer,seller,renter" is one of the
-- commonest values in this account. `lead_type` stays single so the pipeline
-- board, filters and badges keep working, and `deal_types` holds the complete
-- set so nothing is thrown away. Only 8 contacts have "seller" as their primary
-- type; 658 are sellers in some capacity. A single column was hiding 650 of them.

alter table public.contacts
  add column if not exists deal_types text[] not null default '{}'::text[];

-- Existing values must satisfy the new constraint before it is added. 'both'
-- meant buyer-and-seller, so it becomes 'buyer' with 'seller' retained in
-- deal_types. 'investor' has no counterpart in their vocabulary and is treated
-- as a buyer, which is what an investor is on the buying side; the original word
-- is kept in deal_types so the distinction is not lost.
update public.contacts
   set deal_types = case
         when lead_type = 'both'     then array['buyer','seller']
         when lead_type = 'investor' then array['buyer','investor']
         when lead_type = 'unknown'  then '{}'::text[]
         else array[lead_type]
       end
 where deal_types = '{}'::text[];

update public.contacts set lead_type = 'buyer'
 where lead_type in ('both', 'investor');

alter table public.contacts drop constraint if exists contacts_lead_type_check;

do $$ begin
  alter table public.contacts add constraint contacts_lead_type_check
    check (lead_type in ('buyer', 'seller', 'renter', 'vendor', 'agent', 'unknown'));
exception when duplicate_object then null;
end $$;


-- ─── 2c. BoldTrail sync bookkeeping ─────────────────────────────────────────
--
-- THE POINT OF ALL THESE COLUMNS: NOT ASKING AGAIN
-- BoldTrail's API is metered in ways they do not publish, and it answers a
-- lockout with the same 401 it uses for a bad token. So the design rule is that
-- this database is the working copy and BoldTrail is consulted as rarely as
-- possible. Every column here exists to let a run decide "nothing to do" without
-- spending a request:
--
--   external_id           which BoldTrail record this row is, so the same
--                         contact is never imported twice
--   external_updated_at   their timestamp as of the last pull. Their cheap list
--                         endpoint returns this, so one request covering 500
--                         contacts tells us which handful actually changed
--   external_detail_at    when the expensive 83-field record was last fetched.
--                         That one costs a request PER CONTACT
--   remote_hash           fingerprint of what we last saw, to catch a change
--                         their updated_at failed to reflect
--   local_hash            fingerprint of our own syncable fields, so "did Steven
--                         edit this" is answerable without an audit log
--
-- WHY NOT `updated_at > external_synced_at` FOR LOCAL EDITS
-- Because `contacts_touch_updated_at` fires on every update including the sync's
-- own writes, so every row would look locally-edited on the next run and push
-- itself forever. The hash does not have that problem.

alter table public.contacts add column if not exists external_source      text;
alter table public.contacts add column if not exists external_id          text;
alter table public.contacts add column if not exists external_synced_at   timestamptz;
alter table public.contacts add column if not exists external_updated_at  timestamptz;
alter table public.contacts add column if not exists external_detail_at   timestamptz;
alter table public.contacts add column if not exists remote_hash          text;
alter table public.contacts add column if not exists local_hash           text;
alter table public.contacts add column if not exists sync_status          text not null default 'local';
alter table public.contacts add column if not exists sync_error           text;
alter table public.contacts add column if not exists sync_attempts        integer not null default 0;

-- Their payload, kept verbatim and separately from `raw`. `raw` holds the
-- original CSV row and exists so a bad column mapping can be re-derived later;
-- overwriting it with an API response would destroy that guarantee.
alter table public.contacts add column if not exists external_raw jsonb not null default '{}'::jsonb;

-- BoldTrail's own notes, kept alongside Steven's.
--
-- WHY A SEPARATE COLUMN AND NOT `notes`
-- `contacts.notes` is one editable textarea that belongs to Steven. BoldTrail's
-- is an append-only activity log — a list of {date, title, details} entries,
-- many written automatically ("Contact updated by ..."), some real substance.
-- Merging the two would either bury Steven's note in machine chatter or
-- overwrite it on the next sync.
--
-- WHY NOT INSIDE external_raw
-- Because the detail sync overwrites external_raw wholesale with the latest
-- payload. Anything stored under a made-up key there would be silently wiped by
-- the next enrichment run.
alter table public.contacts
  add column if not exists external_notes jsonb not null default '[]'::jsonb;
alter table public.contacts
  add column if not exists external_notes_at timestamptz;

do $$ begin
  alter table public.contacts add constraint contacts_sync_status_check
    check (sync_status in ('local', 'linked', 'conflict', 'error', 'remote_deleted'));
exception when duplicate_object then null;
end $$;


-- ─── 2d. stage — BoldTrail's lead status ────────────────────────────────────
--
-- Same argument as lead_type above, applied to the pipeline. The old list
-- (new / contacted / qualified / active / closed / lost) was invented, and
-- BoldTrail's `status` had nowhere to go, so all 978 imported contacts landed on
-- "new" and stayed there. That is not a pipeline, it is a pile.
--
-- Their status is a numeric code that indexes into their status list:
--
--   0 New Lead   1 Prospect   2 Sphere     3 Active Lead
--   4 Client     5 Contract   6 Closed     7 Archived
--
-- This account uses five of the eight — 0, 1, 3, 4 and 7. All eight are defined,
-- because a status Steven has not used yet is not a status that cannot appear
-- tomorrow. The order matches STAGES in lib/contacts.ts and the index is
-- load-bearing on both sides: see stageFromStatus in lib/boldtrail/mapping.ts.
--
-- The stage is BoldTrail's only at the moment a contact is created. Every move
-- after that is Steven's: a pull seeds `stage` on insert and never touches it
-- again (`stage` is in INSERT_COLUMNS but not UPDATE_COLUMNS in
-- lib/boldtrail/sync.ts), and it is never pushed back — BoldTrail has no deals
-- or opportunities object to push it to.

alter table public.contacts drop constraint if exists contacts_stage_check;

-- Old vocabulary → new. 'qualified' and 'active' both meant "being worked
-- actively", which is one stage here, and 'lost' is what Archived is for.
update public.contacts
   set stage = case stage
         when 'new'       then 'new_lead'
         when 'contacted' then 'prospect'
         when 'qualified' then 'active_lead'
         when 'active'    then 'active_lead'
         when 'lost'      then 'archived'
         else stage
       end
 where stage in ('new', 'contacted', 'qualified', 'active', 'lost');

alter table public.contacts alter column stage set default 'new_lead';

-- Back-fill the contacts imported before their status was understood, from the
-- payload already stored — no BoldTrail requests, and it is the same mapping
-- stageFromStatus applies.
--
-- This reads `external_raw`, which is why section 2c has to come first: on a
-- database being built from scratch that column does not exist until then, and
-- this statement would fail rather than quietly do nothing.
--
-- `stage = 'new_lead'` is the guard that makes this safe to re-run: a contact
-- still sitting on the default is one nobody has moved, so there is nothing to
-- overwrite. Anything Steven has since dragged elsewhere is left where he put it.
update public.contacts
   set stage = case external_raw->>'status'
         when '0' then 'new_lead'
         when '1' then 'prospect'
         when '2' then 'sphere'
         when '3' then 'active_lead'
         when '4' then 'client'
         when '5' then 'contract'
         when '6' then 'closed'
         when '7' then 'archived'
         else stage
       end
 where external_id is not null
   and stage = 'new_lead'
   and external_raw ? 'status';

do $$ begin
  alter table public.contacts add constraint contacts_stage_check
    check (stage in ('new_lead', 'prospect', 'sphere', 'active_lead',
                     'client', 'contract', 'closed', 'archived'));
exception when duplicate_object then null;
end $$;


-- ─── 2e. Indexes, trigger, RLS ──────────────────────────────────────────────

-- Email is the merge key on import, case-insensitively. Partial, because plenty
-- of real contacts arrive with only a phone number and NULLs do not collide.
create unique index if not exists contacts_email_unique
  on public.contacts (lower(email))
  where email is not null and email <> '';

-- One local contact per BoldTrail contact. Partial, because almost every row
-- starts with no external_id and NULLs would collide.
create unique index if not exists contacts_external_unique
  on public.contacts (external_source, external_id)
  where external_id is not null;

create index if not exists contacts_stage_idx      on public.contacts (stage, created_at desc);
create index if not exists contacts_lead_type_idx  on public.contacts (lead_type, created_at desc);
create index if not exists contacts_created_idx    on public.contacts (created_at desc);
create index if not exists contacts_submission_idx on public.contacts (submission_id);
create index if not exists contacts_follow_up_idx  on public.contacts (next_follow_up)
  where next_follow_up is not null;

-- GIN is the index for array containment/overlap, which is what
-- `.overlaps('tags', [...])` compiles to. deal_types answers "everyone who is a
-- seller in any capacity", which the single lead_type column cannot.
create index if not exists contacts_tags_idx       on public.contacts using gin (tags);
create index if not exists contacts_deal_types_idx on public.contacts using gin (deal_types);

-- Only the two location/price indexes that answer a real question: "who do I
-- know in this area" and "who is looking around this price". The rest of the
-- promoted fields are display-only and an index would cost writes for nothing.
create index if not exists contacts_city_state_idx
  on public.contacts (state, city)
  where city is not null or state is not null;
create index if not exists contacts_avg_price_idx
  on public.contacts (avg_price)
  where avg_price is not null;

-- "Which linked contacts still need their detail fetched, oldest first" — the
-- query the budgeted enrichment pass runs on every sync.
create index if not exists contacts_external_detail_idx
  on public.contacts (external_detail_at nulls first)
  where external_id is not null;

create index if not exists contacts_sync_status_idx
  on public.contacts (sync_status)
  where sync_status <> 'local';

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.touch_updated_at();

-- This is Steven's private client list. The anon key must never touch it: no
-- policies are created at all, so with RLS on, every anon read and write is
-- refused. The admin panel reads and writes through the service role, which
-- bypasses RLS, only after confirming a signed-in admin.
alter table public.contacts enable row level security;


-- ═══════════════════════════════════════════════════════════════════════════
--  3. sync_runs / sync_state — BoldTrail run history
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deliberately NOT folded into `import_batches`: that table's `kind` check is
-- ('csv','website'), it has exactly three counters, and the import page renders
-- it as a fixed six-column table. Sync needs a dozen counters plus a cursor and
-- a start/finish pair.
--
-- `requests_made` is the one to watch. If a run that changed nothing still spent
-- hundreds of requests, the "do not ask again" logic has a hole in it.

create table if not exists public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'boldtrail',
  direction       text not null default 'pull',
  mode            text not null default 'incremental',
  status          text not null default 'running',

  listed_count    integer not null default 0,
  detail_count    integer not null default 0,
  created_count   integer not null default 0,
  updated_count   integer not null default 0,
  unchanged_count integer not null default 0,
  conflict_count  integer not null default 0,
  skipped_count   integer not null default 0,
  failed_count    integer not null default 0,
  requests_made   integer not null default 0,

  /* Where an out-of-time run stopped, so the next one resumes instead of
     starting over and re-spending the whole budget. */
  cursor          text,

  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  error           text,
  detail          jsonb not null default '{}'::jsonb
);

do $$ begin
  alter table public.sync_runs add constraint sync_runs_status_check
    check (status in ('running', 'ok', 'partial', 'failed', 'skipped'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.sync_runs add constraint sync_runs_direction_check
    check (direction in ('pull', 'push', 'both'));
exception when duplicate_object then null;
end $$;

create index if not exists sync_runs_started_idx on public.sync_runs (started_at desc);

-- Holds the probe's capability report, the last-run timestamp that enforces the
-- minimum interval between pulls, the detail-enrichment cursor, and a token
-- FINGERPRINT (last 4 characters only — never the token itself).
create table if not exists public.sync_state (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists sync_state_touch_updated_at on public.sync_state;
create trigger sync_state_touch_updated_at
  before update on public.sync_state
  for each row execute function public.touch_updated_at();

-- Same posture as `contacts`: RLS on, no policies.
alter table public.sync_runs  enable row level security;
alter table public.sync_state enable row level security;


-- ═══════════════════════════════════════════════════════════════════════════
--  4. contact_listings — which people are attached to which property
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY A JOIN TABLE AND NOT A COLUMN
-- One listing has several interested buyers, one seller, and eventually one
-- actual buyer; one contact cares about several listings. A `listing_id` column
-- on `contacts` could hold exactly one of those and would lose the rest.
--
-- WHY listing_id IS NOT A FOREIGN KEY
-- Listings live in MongoDB, not in this database — `listing_id` is an ObjectId
-- carried across as text. Postgres cannot enforce it, the same deliberate
-- compromise `contact_submissions.listing_id` already makes. Nothing here
-- cascades when a listing goes away; it does not need to, because listings are
-- never deleted, only marked sold or archived (markListingSold in lib/listings.ts).

create table if not exists public.contact_listings (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  listing_id text not null,

  -- 'interested' is the cheap one: it comes from a website enquiry and means
  -- nothing more than "asked about this". 'buyer' and 'seller' are asserted by
  -- hand and mean the deal actually happened.
  role text not null default 'interested',

  created_at timestamptz not null default now(),

  primary key (contact_id, listing_id, role)
);

do $$ begin
  alter table public.contact_listings add constraint contact_listings_role_check
    check (role in ('buyer', 'seller', 'interested'));
exception when duplicate_object then null;
end $$;

-- The question asked on a listing page is "who is attached to this one", so the
-- listing side needs its own index — the primary key leads with contact_id.
create index if not exists contact_listings_listing_idx
  on public.contact_listings (listing_id, role);

alter table public.contact_listings enable row level security;


-- ═══════════════════════════════════════════════════════════════════════════
--  5. import_batches — CSV / website import history
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The importer dedupes and only fills gaps on existing contacts, so a bad import
-- is not destructive. But "how many leads came in from that BoldTrail export I
-- ran last Tuesday" was previously unanswerable. This is that answer: one row
-- per run, independent of whether any individual contact rows survive later
-- edits or deletes.

create table if not exists public.import_batches (
  id              uuid primary key default gen_random_uuid(),

  -- 'csv' (file upload) or 'website' (pull in website enquiries).
  kind            text not null,
  -- Original file name for CSV imports; null for the website pull.
  file_name       text,
  -- Free-text label the person chose for these leads, e.g. "boldtrail".
  source          text,

  inserted_count  integer not null default 0,
  updated_count   integer not null default 0,
  skipped_count   integer not null default 0,

  created_at      timestamptz not null default now()
);

do $$ begin
  alter table public.import_batches add constraint import_batches_kind_check
    check (kind in ('csv', 'website'));
exception when duplicate_object then null;
end $$;

create index if not exists import_batches_created_idx
  on public.import_batches (created_at desc);

alter table public.import_batches enable row level security;


-- ═══════════════════════════════════════════════════════════════════════════
--  6. contact_submissions — buyer & seller inquiry forms
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Extends the EXISTING table rather than adding a parallel `inquiries` one. That
-- table was created for exactly this purpose, had 0 rows, and was referenced by
-- no code — and a second lead table is the same drift pattern that split
-- `listings`/`blog_posts` from the live site before (see schema.sql).
--
-- Two pre-existing columns are DEPRECATED and deliberately left in place rather
-- than dropped (no rows to lose, and dropping columns on a database shared with
-- the live site is not worth the risk):
--   property_id  uuid FK -> properties.id  — dead: listings live in MongoDB now
--                                            and use ObjectId strings, which
--                                            cannot satisfy a uuid FK. Use the
--                                            `listing_id` text column below.
--   is_read      boolean                   — superseded by `status`.
--
-- NOTE: `contact_submissions.status` is the inbox workflow for one *message*,
-- and is unrelated to `contacts.stage`, which is the pipeline for a *person*.
-- They are separate vocabularies on purpose.

-- What the person is trying to do. Set from which form they submitted, so every
-- row arrives already tagged.
alter table public.contact_submissions
  add column if not exists intent text not null default 'general';

do $$ begin
  alter table public.contact_submissions
    add constraint contact_submissions_intent_check
    check (intent in ('buyer', 'seller', 'general'));
exception when duplicate_object then null;
end $$;

-- The "I'm interested in" dropdown on the general contact form.
alter table public.contact_submissions
  add column if not exists interest text;

-- MongoDB ObjectId (as text) when the inquiry was raised from a listing.
-- Intentionally NOT a foreign key: the referenced records live in Mongo.
alter table public.contact_submissions
  add column if not exists listing_id text;

-- Intent-specific answers (budget, timeline, financing, property address, …).
-- jsonb so the buyer and seller forms can evolve without a migration. Promote a
-- key to its own column once Steven actually wants to filter on it.
alter table public.contact_submissions
  add column if not exists details jsonb not null default '{}'::jsonb;

-- Attribution. `source` already exists and holds utm_source, or the referring
-- host, or 'direct'. These add the rest of the picture.
alter table public.contact_submissions add column if not exists utm_medium   text;
alter table public.contact_submissions add column if not exists utm_campaign text;
alter table public.contact_submissions add column if not exists page_path    text;

alter table public.contact_submissions
  add column if not exists status text not null default 'new';

do $$ begin
  alter table public.contact_submissions
    add constraint contact_submissions_status_check
    check (status in ('new', 'contacted', 'qualified', 'closed', 'spam'));
exception when duplicate_object then null;
end $$;

-- Steven's private notes on a lead. Never shown publicly.
alter table public.contact_submissions add column if not exists notes text;
alter table public.contact_submissions
  add column if not exists updated_at timestamptz not null default now();

-- The inbox lists newest-first and filters by status/intent.
create index if not exists contact_submissions_created_idx
  on public.contact_submissions (created_at desc);
create index if not exists contact_submissions_status_idx
  on public.contact_submissions (status, created_at desc);
create index if not exists contact_submissions_intent_idx
  on public.contact_submissions (intent, created_at desc);
create index if not exists contact_submissions_email_idx
  on public.contact_submissions (lower(email));

-- RLS: verified before this was first written, the anon key COULD insert here
-- (a bare POST with the public anon key returned 201). The website posts through
-- its own API route, which validates input, applies a honeypot + timing check
-- and rate-limits per IP before inserting with the service role. So the anon
-- insert path is revoked. The service role bypasses RLS and needs no policy.
alter table public.contact_submissions enable row level security;

-- Drop every anon/public write policy, whatever it was named. If a policy on
-- this table is missing from the list below, find it with:
--   select policyname, cmd, roles from pg_policies
--    where tablename = 'contact_submissions';
drop policy if exists "Public insert contact_submissions" on public.contact_submissions;
drop policy if exists "Public can insert contact_submissions" on public.contact_submissions;
drop policy if exists "Anyone can insert contact_submissions" on public.contact_submissions;
drop policy if exists "Enable insert for anon" on public.contact_submissions;
drop policy if exists "Enable insert for all users" on public.contact_submissions;
drop policy if exists "contact_submissions_insert_anon" on public.contact_submissions;


-- ═══════════════════════════════════════════════════════════════════════════
--  7. campaigns — popup announcements on the public site
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.campaigns (
  id                     uuid primary key default gen_random_uuid(),

  title                  text not null,   -- internal name, never shown to visitors
  headline               text not null,   -- shown in the popup
  body                   text,
  media_url              text,
  media_type             text not null default 'image',   -- 'image' | 'video'
  cta_text               text,
  cta_url                text,

  status                 text not null default 'draft',
  -- Higher wins when more than one campaign is live at once.
  priority               integer not null default 0,
  starts_at              timestamptz,
  ends_at                timestamptz,
  display_delay_seconds  integer not null default 3,
  frequency              text not null default 'once_per_session',

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Upgrade path for a database that ran an earlier version of this table, back
-- when the column was `image_url` with no media type. This rename is why
-- /api/campaigns was returning 500 in production: the app was already querying
-- `media_url` against a table that still had `image_url`.
do $$ begin
  alter table public.campaigns rename column image_url to media_url;
exception when undefined_column then null;
end $$;

alter table public.campaigns add column if not exists media_type text not null default 'image';

do $$ begin
  alter table public.campaigns add constraint campaigns_status_check
    check (status in ('draft', 'published', 'archived'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.campaigns add constraint campaigns_frequency_check
    check (frequency in ('once_per_session', 'once_per_visitor', 'every_visit'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.campaigns add constraint campaigns_media_type_check
    check (media_type in ('image', 'video'));
exception when duplicate_object then null;
end $$;

create index if not exists campaigns_public_idx
  on public.campaigns (status, priority desc, created_at desc);

drop trigger if exists campaigns_touch_updated_at on public.campaigns;
create trigger campaigns_touch_updated_at
  before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- Published campaigns are public content (like blogs/testimonials). The public
-- site's own date-window logic still applies via GET /api/campaigns; this policy
-- is a direct-read fallback and defence in depth.
alter table public.campaigns enable row level security;

drop policy if exists "Public read published campaigns" on public.campaigns;
create policy "Public read published campaigns"
  on public.campaigns for select
  using (status = 'published');


-- ═══════════════════════════════════════════════════════════════════════════
--  8. testimonials
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Moves the client quotes off the public site, where they were a hardcoded array
-- in src/components/Testimonials.jsx, and into a table Steven can edit.

create table if not exists public.testimonials (
  id          uuid primary key default gen_random_uuid(),

  quote       text not null,
  name        text not null,
  role        text,               -- "First-Time Buyers · Frisco, TX"
  -- Shown in the avatar circle. Derived from the name when left blank.
  initials    text,
  rating      int  not null default 5,
  -- The first card on the site is dark; this is what drives that treatment.
  featured    boolean not null default false,
  sort_order  int  not null default 0,
  status      text not null default 'published',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$ begin
  alter table public.testimonials
    add constraint testimonials_rating_check check (rating between 1 and 5);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.testimonials
    add constraint testimonials_status_check check (status in ('draft', 'published'));
exception when duplicate_object then null;
end $$;

create index if not exists testimonials_public_idx
  on public.testimonials (status, sort_order, created_at desc);

drop trigger if exists testimonials_touch_updated_at on public.testimonials;
create trigger testimonials_touch_updated_at
  before update on public.testimonials
  for each row execute function public.touch_updated_at();

-- The public site reads these directly with the anon key, exactly as it already
-- does for blogs, so published rows are readable by anyone. Drafts are not, and
-- every write goes through the service role from the admin panel.
alter table public.testimonials enable row level security;

drop policy if exists "Public read published testimonials" on public.testimonials;
create policy "Public read published testimonials"
  on public.testimonials for select
  using (status = 'published');

-- Seed: the three quotes that were hardcoded on the site, copied verbatim —
-- these are real clients' words, so they are reproduced exactly, in the same
-- order, with the dark first card preserved as `featured`. The WHERE NOT EXISTS
-- guard means this fires only into an empty table and will never resurrect a row
-- that has been deleted.
insert into public.testimonials (quote, name, role, initials, rating, featured, sort_order, status)
select * from (values
  (
    'Steven made the whole homebuying process feel easy — which, honestly, we didn''t think was possible. He knew the DFW market cold and figured out what we needed before we even could. We genuinely couldn''t have done this without him.',
    'James & Rachel',
    'First-Time Buyers · Frisco, TX',
    'JR', 5, true, 1, 'published'
  ),
  (
    'As an investor, speed and accuracy are everything to me. Steven''s REO expertise has helped me close over a dozen deals without a single hiccup. He thinks like an investor, not just a broker — and that makes all the difference.',
    'Marcus T.',
    'Real Estate Investor · Dallas, TX',
    'MT', 5, false, 2, 'published'
  ),
  (
    'The transparency was honestly refreshing. Steven kept us in the loop at every single step, and his negotiation saved us thousands on our luxury listing. I''d recommend him without a moment''s hesitation.',
    'David & Karen L.',
    'Home Sellers · Plano, TX',
    'DL', 5, false, 3, 'published'
  )
) as seed(quote, name, role, initials, rating, featured, sort_order, status)
where not exists (select 1 from public.testimonials);


-- ═══════════════════════════════════════════════════════════════════════════
--  9. Storage buckets
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Both are public-read with a HARD per-file size cap enforced by Supabase
-- Storage itself, so it cannot be bypassed by the client. Two buckets rather
-- than one because a popup video needs a far higher cap than a listing photo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'property-images', 'property-images', true,
    5242880,             -- 5 MB per file
    array['image/jpeg','image/png','image/webp','image/avif','image/gif']
  ),
  (
    'campaign-media', 'campaign-media', true,
    26214400,            -- 25 MB per file
    array['image/jpeg','image/png','image/webp','image/avif','image/gif',
          'video/mp4','video/webm','video/quicktime']
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public can view; only authenticated admin users can upload/update/delete.
drop policy if exists "property-images public read" on storage.objects;
create policy "property-images public read"
  on storage.objects for select
  using ( bucket_id = 'property-images' );

drop policy if exists "property-images authenticated upload" on storage.objects;
create policy "property-images authenticated upload"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'property-images' );

drop policy if exists "property-images authenticated update" on storage.objects;
create policy "property-images authenticated update"
  on storage.objects for update to authenticated
  using ( bucket_id = 'property-images' );

drop policy if exists "property-images authenticated delete" on storage.objects;
create policy "property-images authenticated delete"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'property-images' );

drop policy if exists "campaign-media public read" on storage.objects;
create policy "campaign-media public read"
  on storage.objects for select
  using ( bucket_id = 'campaign-media' );

drop policy if exists "campaign-media authenticated upload" on storage.objects;
create policy "campaign-media authenticated upload"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'campaign-media' );

drop policy if exists "campaign-media authenticated update" on storage.objects;
create policy "campaign-media authenticated update"
  on storage.objects for update to authenticated
  using ( bucket_id = 'campaign-media' );

drop policy if exists "campaign-media authenticated delete" on storage.objects;
create policy "campaign-media authenticated delete"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'campaign-media' );
