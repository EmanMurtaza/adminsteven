-- BoldTrail sync bookkeeping.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- THE POINT OF ALL THESE COLUMNS: NOT ASKING AGAIN
-- BoldTrail's API is metered in ways they do not publish, and it answers a
-- lockout with the same 401 it uses for a bad token. So the design rule is that
-- this database is the working copy and BoldTrail is consulted as rarely as
-- possible. Every column here exists to let a sync run decide "nothing to do"
-- without spending a request:
--
--   external_id           which BoldTrail record this row is, so the same
--                         contact is never imported twice
--   external_updated_at   their timestamp as of the last pull. Their cheap list
--                         endpoint returns this, so one request covering 500
--                         contacts tells us which handful actually changed
--   external_detail_at    when the expensive 83-field record was last fetched.
--                         That one costs a request PER CONTACT, so it is only
--                         re-fetched when their updated_at moves
--   remote_hash           fingerprint of what we last saw, to catch a change
--                         their updated_at failed to reflect
--   local_hash            fingerprint of our own syncable fields, so "did
--                         Steven edit this" is answerable without an audit log
--
-- WHY NOT `updated_at > external_synced_at` FOR LOCAL EDITS
-- Because `contacts_touch_updated_at` fires on every update including the
-- sync's own writes, so every row would look locally-edited on the next run and
-- push itself forever. The hash does not have that problem.

-- ─── Per-contact sync state ──────────────────────────────────────────────────

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

do $$ begin
  alter table public.contacts add constraint contacts_sync_status_check
    check (sync_status in ('local', 'linked', 'conflict', 'error', 'remote_deleted'));
exception when duplicate_object then null;
end $$;

-- One local contact per BoldTrail contact. Partial, because almost every row
-- starts with no external_id and NULLs would collide.
create unique index if not exists contacts_external_unique
  on public.contacts (external_source, external_id)
  where external_id is not null;

-- "Which linked contacts still need their detail fetched, oldest first" — the
-- query the budgeted enrichment pass runs on every sync.
create index if not exists contacts_external_detail_idx
  on public.contacts (external_detail_at nulls first)
  where external_id is not null;

-- Finding rows that need attention without scanning the table.
create index if not exists contacts_sync_status_idx
  on public.contacts (sync_status)
  where sync_status <> 'local';

-- ─── Run history ─────────────────────────────────────────────────────────────
-- Deliberately NOT folded into `import_batches`: that table's `kind` check is
-- ('csv','website'), it has exactly three counters, and the import page renders
-- it as a fixed six-column table. Sync needs a dozen counters plus a cursor and
-- a start/finish pair.
--
-- `requests_made` is the one to watch. If a run that changed nothing still
-- spent hundreds of requests, the "do not ask again" logic has a hole in it.

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

-- ─── Key/value state ─────────────────────────────────────────────────────────
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

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Same posture as `contacts`: RLS on, no policies, so the anon key is refused
-- outright and only the service role behind a signed-in admin can read.
alter table public.sync_runs  enable row level security;
alter table public.sync_state enable row level security;

-- ─── Verify ──────────────────────────────────────────────────────────────────
--   select count(*) from public.sync_runs;   -- expect 0
--   select count(*) from public.sync_state;  -- expect 0
--   select policyname from pg_policies where tablename in ('sync_runs','sync_state');
