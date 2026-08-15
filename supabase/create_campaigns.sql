-- Popup campaigns — announcements the public site shows in a modal shortly
-- after a visitor opens the homepage.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.

create extension if not exists pgcrypto;

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

-- Upgrade path for anyone who already ran an earlier version of this file
-- (back when the column was `image_url` with no media type).
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

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists campaigns_public_idx
  on public.campaigns (status, priority desc, created_at desc);

-- ─── updated_at ──────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists campaigns_touch_updated_at on public.campaigns;
create trigger campaigns_touch_updated_at
  before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Published campaigns are public content (like blogs/testimonials) — the
-- public site's own date-window logic still applies via GET /api/campaigns,
-- but this policy is a direct-read fallback and defense in depth.
alter table public.campaigns enable row level security;

drop policy if exists "Public read published campaigns" on public.campaigns;
create policy "Public read published campaigns"
  on public.campaigns for select
  using (status = 'published');

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect exactly one SELECT policy for anon/authenticated:
--   select policyname, cmd, roles from pg_policies where tablename = 'campaigns';
