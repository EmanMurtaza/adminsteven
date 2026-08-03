-- Editable testimonials (Phase 1, F6)
--
-- Moves the client quotes off the public site, where they were a hardcoded
-- array in src/components/Testimonials.jsx, and into a table Steven can edit.
--
-- Run once in the Supabase SQL editor. Safe to re-run: the seed is guarded so
-- it only fires into an empty table and will not resurrect deleted rows.

create extension if not exists pgcrypto;

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

-- Also defined by create_contacts_crm.sql; repeated so this file stands alone.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists testimonials_touch_updated_at on public.testimonials;
create trigger testimonials_touch_updated_at
  before update on public.testimonials
  for each row execute function public.touch_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- The public site reads these directly with the anon key, exactly as it already
-- does for blogs, so published rows are readable by anyone. Drafts are not, and
-- every write goes through the service role from the admin panel.
alter table public.testimonials enable row level security;

drop policy if exists "Public read published testimonials" on public.testimonials;
create policy "Public read published testimonials"
  on public.testimonials for select
  using (status = 'published');

-- ─── Seed ────────────────────────────────────────────────────────────────────
-- The three quotes currently hardcoded on the site, copied verbatim — these are
-- real clients' words, so they are reproduced exactly, in the same order, with
-- the dark first card preserved as `featured`.
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
