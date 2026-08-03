-- Personal CRM — the table that replaces BoldTrail.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- WHY A NEW TABLE, NOT contact_submissions
-- `contact_submissions` is an event log: "someone submitted a form at 3pm".
-- A CRM row is a *person* with a lifecycle, and one person can submit three
-- times. Stages, notes and follow-up dates belong to the person, not to any
-- one submission. So submissions stay as the immutable record of what came in,
-- and `contacts` is the working list Steven actually manages. A submission is
-- linked to the contact it produced via contacts.submission_id.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),

  first_name    text,
  last_name     text,
  email         text,
  phone         text,

  -- What they are to the business.
  lead_type     text not null default 'unknown',
  -- Where they are in the pipeline.
  stage         text not null default 'new',
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

do $$ begin
  alter table public.contacts add constraint contacts_lead_type_check
    check (lead_type in ('buyer', 'seller', 'investor', 'both', 'unknown'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.contacts add constraint contacts_stage_check
    check (stage in ('new', 'contacted', 'qualified', 'active', 'closed', 'lost'));
exception when duplicate_object then null;
end $$;

-- ─── Deduplication ───────────────────────────────────────────────────────────
-- Email is the merge key on import, case-insensitively. Partial, because plenty
-- of real contacts arrive with only a phone number and NULLs do not collide.
create unique index if not exists contacts_email_unique
  on public.contacts (lower(email))
  where email is not null and email <> '';

-- ─── Indexes for the list views ──────────────────────────────────────────────
create index if not exists contacts_stage_idx        on public.contacts (stage, created_at desc);
create index if not exists contacts_lead_type_idx    on public.contacts (lead_type, created_at desc);
create index if not exists contacts_follow_up_idx    on public.contacts (next_follow_up)
  where next_follow_up is not null;
create index if not exists contacts_created_idx      on public.contacts (created_at desc);
create index if not exists contacts_submission_idx   on public.contacts (submission_id);

-- ─── updated_at ──────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.touch_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- This is Steven's private client list. The anon key must never touch it: no
-- policies are created at all, so with RLS on, every anon read and write is
-- refused. The admin panel reads and writes through the service role, which
-- bypasses RLS, only after confirming a signed-in admin.
alter table public.contacts enable row level security;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect 0 rows (no anon access):
--   select policyname, cmd, roles from pg_policies where tablename = 'contacts';
