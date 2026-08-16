-- Which people are attached to which property.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- WHY A JOIN TABLE AND NOT A COLUMN
-- One listing has several interested buyers, one seller, and eventually one
-- actual buyer; one contact cares about several listings. A `listing_id` column
-- on `contacts` could hold exactly one of those relationships and would lose
-- the rest, so the relationship gets its own table with a role on it.
--
-- WHY listing_id IS NOT A FOREIGN KEY
-- Listings live in MongoDB, not in this database — `listing_id` is an ObjectId
-- carried across as text. Postgres cannot enforce it, which is the same
-- deliberate compromise `contact_submissions.listing_id` already makes.
--
-- The practical consequence: nothing here cascades when a listing goes away. It
-- does not need to, because listings are never deleted — they are marked sold
-- or archived (see markListingSold in lib/listings.ts).

create table if not exists public.contact_listings (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  -- Mongo ObjectId as text. Intentionally not a foreign key — see above.
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

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Says who is interested in what, about Steven's private client list. Same
-- posture as `contacts`: RLS on, no policies at all, so the anon key is refused
-- outright and only the service role (behind a signed-in admin) can read it.
alter table public.contact_listings enable row level security;

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- Expect 0 rows (no anon access):
--   select policyname, cmd, roles from pg_policies where tablename = 'contact_listings';
