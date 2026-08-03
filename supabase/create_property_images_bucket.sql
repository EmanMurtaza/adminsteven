-- Dedicated public storage bucket for listing/property photos.
--
-- Enforces a HARD 5 MB per-file size cap (file_size_limit, in bytes) and
-- restricts uploads to image mime types. The size limit is enforced by
-- Supabase Storage itself, so it cannot be bypassed by the client.
--
-- Safe to re-run: the bucket upsert and the drop-then-create policies are
-- idempotent.

-- ── Bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images',
  'property-images',
  true,                 -- public read (photos render on the website)
  5242880,              -- 5 MB hard cap per file (5 * 1024 * 1024 bytes)
  array['image/jpeg','image/png','image/webp','image/avif','image/gif']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Policies on storage.objects (scoped to this bucket) ──────────────────────
-- Public can view; only authenticated admin users can upload/update/delete.

drop policy if exists "property-images public read" on storage.objects;
create policy "property-images public read"
  on storage.objects for select
  using ( bucket_id = 'property-images' );

drop policy if exists "property-images authenticated upload" on storage.objects;
create policy "property-images authenticated upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'property-images' );

drop policy if exists "property-images authenticated update" on storage.objects;
create policy "property-images authenticated update"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'property-images' );

drop policy if exists "property-images authenticated delete" on storage.objects;
create policy "property-images authenticated delete"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'property-images' );

-- Verify
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'property-images';
