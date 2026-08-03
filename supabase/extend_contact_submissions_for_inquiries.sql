-- Buyer & Seller Inquiry Forms (Phase 1, F4)
--
-- Extends the EXISTING `contact_submissions` table rather than adding a
-- parallel `inquiries` table. That table was created for exactly this purpose,
-- had 0 rows, and was referenced by no code — and a second lead table is the
-- same drift pattern that split `listings`/`blog_posts` from the live site
-- before (see the note at the top of schema.sql).
--
-- Run this in the Supabase SQL editor. Safe to re-run: every statement is
-- guarded with IF NOT EXISTS / DROP POLICY IF EXISTS.
--
-- Two pre-existing columns are now DEPRECATED and are deliberately left in
-- place rather than dropped (no rows to lose, and dropping columns on a shared
-- database is not worth the risk):
--   property_id  uuid FK -> properties.id  — dead: listings live in MongoDB now
--                                            and use ObjectId strings, which
--                                            cannot satisfy a uuid FK. Use the
--                                            new `listing_id` text column.
--   is_read      boolean                   — superseded by `status`.

-- ─── Lead classification ─────────────────────────────────────────────────────

-- What the person is trying to do. Set from which form they submitted, so
-- every row arrives already tagged.
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
-- Kept as jsonb so the buyer and seller forms can evolve without a migration.
-- Promote a key to its own column once Steven actually wants to filter on it.
alter table public.contact_submissions
  add column if not exists details jsonb not null default '{}'::jsonb;

-- ─── Attribution ─────────────────────────────────────────────────────────────
-- `source` already exists and holds utm_source, or the referring host, or
-- 'direct'. These add the rest of the picture.

alter table public.contact_submissions
  add column if not exists utm_medium text;
alter table public.contact_submissions
  add column if not exists utm_campaign text;
alter table public.contact_submissions
  add column if not exists page_path text;

-- ─── Workflow ────────────────────────────────────────────────────────────────

alter table public.contact_submissions
  add column if not exists status text not null default 'new';

do $$ begin
  alter table public.contact_submissions
    add constraint contact_submissions_status_check
    check (status in ('new', 'contacted', 'qualified', 'closed', 'spam'));
exception when duplicate_object then null;
end $$;

-- Steven's private notes on a lead. Never shown publicly.
alter table public.contact_submissions
  add column if not exists notes text;

alter table public.contact_submissions
  add column if not exists updated_at timestamptz not null default now();

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- The inbox lists newest-first and filters by status/intent.

create index if not exists contact_submissions_created_idx
  on public.contact_submissions (created_at desc);
create index if not exists contact_submissions_status_idx
  on public.contact_submissions (status, created_at desc);
create index if not exists contact_submissions_intent_idx
  on public.contact_submissions (intent, created_at desc);
create index if not exists contact_submissions_email_idx
  on public.contact_submissions (lower(email));

-- ─── Row Level Security ──────────────────────────────────────────────────────
--
-- Verified before this migration: RLS is ON, the anon key CANNOT select, but it
-- CAN insert (a bare POST with the public anon key returned 201). That leaves an
-- unauthenticated, unvalidated, unthrottled write endpoint open to anyone who
-- reads the site's JS bundle.
--
-- Every write now goes through POST /api/inquiries in the admin app, which
-- validates input, applies a honeypot + timing check, and rate-limits per IP
-- before inserting with the service role. So the anon insert path is revoked.
--
-- The service role bypasses RLS entirely, so it needs no policy.

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

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- After running, confirm no anon policies remain (expect 0 rows):
--   select policyname, cmd, roles from pg_policies
--    where tablename = 'contact_submissions'
--      and 'anon' = any (roles);
--
-- Then re-run the probe from a terminal — it must now return 401/403, not 201:
--   curl -i -X POST "$SUPABASE_URL/rest/v1/contact_submissions" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"name":"probe","email":"p@example.com","message":"probe"}'
