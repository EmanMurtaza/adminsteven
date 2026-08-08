-- Leads import history — an audit trail for the contacts CSV importer and
-- the "pull in website enquiries" action.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- WHY THIS TABLE
-- The importer already dedupes and only fills gaps on existing contacts
-- (see app/(dashboard)/contacts/import/page.tsx), so a bad import is not
-- destructive. But "how many leads came in from that BoldTrail export I ran
-- last Tuesday" was previously unanswerable. This table is that answer: one
-- row per import run, independent of whether any individual contact rows
-- survive later edits or deletes.

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

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Same posture as `contacts`: no anon access at all. The admin panel reads
-- and writes through the service role, only after confirming a signed-in
-- admin.
alter table public.import_batches enable row level security;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect 0 rows (no anon access):
--   select policyname, cmd, roles from pg_policies where tablename = 'import_batches';
