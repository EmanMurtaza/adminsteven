-- BoldTrail's own notes, kept alongside Steven's.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
--
-- WHY A SEPARATE COLUMN AND NOT `notes`
-- `contacts.notes` is one editable textarea that belongs to Steven. BoldTrail's
-- is an append-only activity log — a list of {date, title, details} entries,
-- many of them written automatically ("Contact updated by ..."), some of them
-- real substance ("85% LTC, construction 100%..."). Merging the two would
-- either bury Steven's note in machine chatter or overwrite it on the next
-- sync. They are different things, so they get different columns.
--
-- WHY NOT INSIDE external_raw
-- Because the detail sync overwrites external_raw wholesale with the latest
-- payload from BoldTrail. Anything stored under a made-up key there would be
-- silently wiped by the next enrichment run.

alter table public.contacts
  add column if not exists external_notes jsonb not null default '[]'::jsonb;

-- When their notes were last fetched — the notes endpoint is a separate request
-- per contact, so it is paced the same way the detail endpoint is.
alter table public.contacts
  add column if not exists external_notes_at timestamptz;

-- ─── Verify ──────────────────────────────────────────────────────────────────
--   select count(*) filter (where jsonb_array_length(external_notes) > 0) as with_notes,
--          count(*) filter (where array_length(tags, 1) > 0)             as with_tags,
--          count(*) as total
--     from public.contacts;
