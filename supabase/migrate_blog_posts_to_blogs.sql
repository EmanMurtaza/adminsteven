-- Migrate the legacy `blog_posts` table into the live `blogs` table, then drop it.
--
-- Context: `blogs` is the table the main site (stevenmoning.vercel.app) renders
-- and the admin's rich-text /blog system reads/writes. `blog_posts` was a
-- drifted admin-only leftover. This copies content across, mapping:
--   image -> cover_image,  cat -> tags[],  derive status from published_at.
--
-- Wrapped in a transaction: if the INSERT fails for any reason, the DROP does
-- not happen (everything rolls back), so the data can never be lost mid-way.
-- Safe to re-run: ON CONFLICT (slug) DO NOTHING skips rows already migrated;
-- if blog_posts is already gone the script simply errors with "does not exist".

BEGIN;

INSERT INTO public.blogs
  (title, slug, excerpt, content, cover_image, author, tags, status, published_at, meta)
SELECT
  title,
  slug,
  excerpt,
  content,
  image                                   AS cover_image,
  author,
  ARRAY[cat]                              AS tags,
  CASE WHEN published_at <= now()
       THEN 'published' ELSE 'draft' END  AS status,
  published_at,
  '{}'::jsonb                             AS meta
FROM public.blog_posts
ON CONFLICT (slug) DO NOTHING;

DROP TABLE public.blog_posts;

COMMIT;

-- Verify: should list your migrated posts, all in the `blogs` table now.
SELECT id, slug, status, tags, published_at
FROM public.blogs
ORDER BY published_at DESC;
