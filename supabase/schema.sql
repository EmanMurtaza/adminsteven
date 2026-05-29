-- Already run on project: https://lktmlevsotbvnkkcrreg.supabase.co
-- Project: Moning Associates | East US (North Virginia)

create extension if not exists "uuid-ossp";

create table if not exists listings (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  description text,
  price       numeric(12, 2),
  category    text,
  status      text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  images      text[] not null default '{}',
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at on row change
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger listings_updated_at
  before update on listings
  for each row execute procedure set_updated_at();

-- Row Level Security
alter table listings enable row level security;

-- Admin (service role) can do everything — no policy needed, service role bypasses RLS
-- Main website (anon key) can only read published listings
create policy "Public can read published listings"
  on listings for select
  using (status = 'published');

-- ─── Blog Posts ───────────────────────────────────────────────────────────────

create table if not exists blog_posts (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  slug        text unique not null,
  author      text,
  excerpt     text,
  content     text not null default '',
  cover_image text,
  tags        text[] not null default '{}',
  status      text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger blog_posts_updated_at
  before update on blog_posts
  for each row execute procedure set_updated_at();

alter table blog_posts enable row level security;

create policy "Public can read published posts"
  on blog_posts for select
  using (status = 'published');

-- ─── Storage: blog-images bucket ─────────────────────────────────────────────
-- Run in Supabase dashboard → Storage → New bucket: "blog-images", Public = true
-- Then run these policies:
--
-- insert into storage.buckets (id, name, public) values ('blog-images', 'blog-images', true);
--
-- create policy "Authenticated can upload blog images"
--   on storage.objects for insert
--   with check (auth.role() = 'authenticated' and bucket_id = 'blog-images');
--
-- create policy "Public can view blog images"
--   on storage.objects for select
--   using (bucket_id = 'blog-images');
