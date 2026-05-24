-- =============================================================================
-- Blog posts RLS hardening
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Project: lktmlevsotbvnkkcrreg (Moning Associates)
-- =============================================================================
--
-- Security model:
--   • anon role (public site visitors)      → can SELECT only
--   • authenticated role (logged-in admins) → can INSERT / UPDATE / DELETE
--   • service_role (server-only key)        → bypasses RLS entirely (default)
--
-- Anyone with a Supabase Auth account on this project will be treated as
-- an admin. To restrict admin access, only create accounts for trusted users
-- in Authentication → Users (Disable "Enable signups" in Auth settings).
-- =============================================================================

-- 1) Ensure RLS is on (no-op if already on)
alter table public.blog_posts enable row level security;

-- 2) Drop any prior write policies so this script is idempotent
drop policy if exists "Authenticated can insert blog posts"  on public.blog_posts;
drop policy if exists "Authenticated can update blog posts"  on public.blog_posts;
drop policy if exists "Authenticated can delete blog posts"  on public.blog_posts;

-- 3) Public read (keep the existing select policy if it already exists)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'blog_posts'
      and policyname = 'Public can read blog posts'
  ) then
    create policy "Public can read blog posts"
      on public.blog_posts
      for select
      using (true);
  end if;
end$$;

-- 4) Authenticated writes — only logged-in users (= admins)
create policy "Authenticated can insert blog posts"
  on public.blog_posts
  for insert
  to authenticated
  with check (true);

create policy "Authenticated can update blog posts"
  on public.blog_posts
  for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated can delete blog posts"
  on public.blog_posts
  for delete
  to authenticated
  using (true);

-- 5) (Recommended) Disable public signups so random people can't grant
--    themselves admin access. This is set in the Dashboard:
--      Authentication → Providers → Email → "Enable Sign ups" = OFF
--    Then add admins manually via Authentication → Users → "Add user".
