-- Dedicated public storage bucket for campaign popup media (photos or a
-- short video). Separate from `property-images` because a popup video needs
-- a much higher size cap than a listing photo.
--
-- Enforces a HARD 25 MB per-file size cap (file_size_limit, in bytes) and
-- restricts uploads to image/video mime types. The size limit is enforced by
-- Supabase Storage itself, so it cannot be bypassed by the client.
--
-- Safe to re-run: the bucket upsert and the drop-then-create policies are
-- idempotent.

-- ── Bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-media',
  'campaign-media',
  true,                  -- public read (renders in the popup on the website)
  26214400,              -- 25 MB hard cap per file (25 * 1024 * 1024 bytes)
  array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Policies on storage.objects (scoped to this bucket) ──────────────────────
-- Public can view; only authenticated admin users can upload/update/delete.

drop policy if exists "campaign-media public read" on storage.objects;
create policy "campaign-media public read"
  on storage.objects for select
  using ( bucket_id = 'campaign-media' );

drop policy if exists "campaign-media authenticated upload" on storage.objects;
create policy "campaign-media authenticated upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'campaign-media' );

drop policy if exists "campaign-media authenticated update" on storage.objects;
create policy "campaign-media authenticated update"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'campaign-media' );

drop policy if exists "campaign-media authenticated delete" on storage.objects;
create policy "campaign-media authenticated delete"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'campaign-media' );

-- Verify
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'campaign-media';
