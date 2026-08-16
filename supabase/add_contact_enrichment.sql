-- Fields worth promoting out of BoldTrail's export.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- WHY THESE SIX AND NOT THE OTHER NINETY
-- BoldTrail's contact export ships 100+ columns. The importer already keeps
-- every one of them verbatim in `contacts.raw`, so nothing is lost by leaving
-- them there — a column only earns its place when Steven needs to filter,
-- sort or act on it. That is the same rule `contact_submissions.details`
-- follows: promote a key once there is a reason to query it.
--
-- `email_opt_in` is the one that is not a convenience. This app has a
-- `campaigns` feature, and mailing someone who opted out is a legal problem
-- rather than an untidy one. It needs to be queryable before the first send,
-- not after.

alter table public.contacts add column if not exists rating            smallint;
alter table public.contacts add column if not exists email_opt_in      boolean;
alter table public.contacts add column if not exists assigned_agent    text;
-- BoldTrail calls this "registered date": when the lead first appeared over
-- there, which is older than our `created_at` for anything imported.
alter table public.contacts add column if not exists first_seen_at     timestamptz;
alter table public.contacts add column if not exists last_closing_date date;
alter table public.contacts add column if not exists homeowner_status  text;

do $$ begin
  alter table public.contacts add constraint contacts_rating_check
    check (rating is null or rating between 0 and 5);
exception when duplicate_object then null;
end $$;

-- ─── Tag filtering ───────────────────────────────────────────────────────────
-- `tags` has been written by the CSV importer since day one (BoldTrail exports
-- them as "hashtags") but there was no way to filter on it. GIN is the index
-- for array containment/overlap, which is what `.overlaps('tags', [...])`
-- compiles to.
create index if not exists contacts_tags_idx on public.contacts using gin (tags);

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect the six new columns:
--   select column_name, data_type from information_schema.columns
--    where table_name = 'contacts'
--      and column_name in ('rating','email_opt_in','assigned_agent',
--                          'first_seen_at','last_closing_date','homeowner_status');
