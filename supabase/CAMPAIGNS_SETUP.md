# Campaigns — setup guide

Campaigns are popups the main website (stevenmoning.vercel.app) shows
visitors shortly after they open the site — an announcement, an open-house
promo, a seasonal push, etc. Each one has a photo or video, a headline, body
text, an optional button, and rules for when/how often it shows.

This doc covers the one-time Supabase setup. The feature itself is built —
nothing else to code.

## 1. Run the table migration

Supabase dashboard → **SQL Editor** → paste and run. Safe to re-run any time
(idempotent), including if you already ran an older version of this file.

```sql
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

create index if not exists campaigns_public_idx
  on public.campaigns (status, priority desc, created_at desc);

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

alter table public.campaigns enable row level security;

drop policy if exists "Public read published campaigns" on public.campaigns;
create policy "Public read published campaigns"
  on public.campaigns for select
  using (status = 'published');
```

Source of truth: [`setup.sql`](./setup.sql), section 7 (same
content — this doc just explains it).

## 2. Run the storage bucket migration

Same place, new query. Creates the bucket photos/videos upload into.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-media',
  'campaign-media',
  true,
  26214400,   -- 25 MB hard cap per file
  array['image/jpeg','image/png','image/webp','image/avif','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

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
```

Source of truth: [`setup.sql`](./setup.sql), section 9.

## 3. Verify

Run in the SQL Editor:

```sql
-- Table shape — expect media_url, media_type, and the rest of the columns above
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'campaigns';

-- Exactly one public SELECT policy, scoped to published rows
select policyname, cmd, roles from pg_policies where tablename = 'campaigns';

-- Bucket exists with the 25 MB cap and image+video mime types
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'campaign-media';
```

## Where things live

| Piece | Location |
|---|---|
| Admin list/create/edit UI | `/campaigns` in this app (sidebar → Campaigns) |
| Types | [`lib/campaigns.ts`](../lib/campaigns.ts) |
| Form (photo/video upload) | [`components/campaigns/CampaignForm.tsx`](../components/campaigns/CampaignForm.tsx) |
| Public API | `GET /api/campaigns`, `GET/PUT/DELETE /api/campaigns/:id` — see [`app/api/campaigns/route.ts`](../app/api/campaigns/route.ts) |
| Public-site popup component | [`integration/CampaignPopup.tsx`](../integration/CampaignPopup.tsx) — copy into the *other* repo (stevenmoning.vercel.app), see `integration/README.md` |

## Public API reference

`GET /api/campaigns` — same shape as `/api/listings` and `/api/blog`:

| Query param | Default | Meaning |
|---|---|---|
| `status` | `published` | Filter by status (`draft` \| `published` \| `archived`) |
| `limit` | `20` (max `100`) | Page size |
| `offset` | `0` | Pagination offset |
| `live` | `true` | When `true`, only returns campaigns inside their `starts_at`/`ends_at` window. Pass `live=false` to see everything in that status regardless of scheduling (e.g. for a preview). |

Response: `{ "data": Campaign[], "count": number }`, ordered by `priority`
descending then `created_at` descending — so `data[0]` is the one to show if
your popup only shows one at a time.

Writes (`POST /api/campaigns`, `PUT`/`DELETE /api/campaigns/:id`) require an
`x-api-key` header matching `ADMIN_API_KEY`. The admin UI doesn't use these —
it writes straight to Supabase — they exist for parity with listings/blog in
case something external ever needs to create campaigns programmatically.
