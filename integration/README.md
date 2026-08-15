# Campaign popup — public site integration

This isn't part of the admin panel's build — it's a standalone file to copy
into the **public website's** repo (stevenmoning.vercel.app), which lives
outside this project.

## 1. Copy the file

Copy `CampaignPopup.tsx` into the public site's `src/components/` (or
equivalent). If that site is Next.js App Router, add `"use client";` as the
first line of the file — it uses `useState`/`useEffect`.

## 2. Set the API base URL

Open the copied file and replace this line with the admin panel's actual
deployed URL:

```ts
const API_BASE = "https://REPLACE-WITH-ADMIN-PANEL-DOMAIN.vercel.app";
```

## 3. Mount it once, near the root

**Vite / plain React** (`src/App.tsx`):
```tsx
import CampaignPopup from "./components/CampaignPopup";

export default function App() {
  return (
    <>
      <CampaignPopup />
      {/* ...rest of the app... */}
    </>
  );
}
```

**Next.js App Router** (`app/layout.tsx`):
```tsx
import CampaignPopup from "@/components/CampaignPopup";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CampaignPopup />
        {children}
      </body>
    </html>
  );
}
```

## What it does

- Fetches `GET {API_BASE}/api/campaigns` on load — this already only returns
  campaigns that are published and inside their start/end window, ranked by
  priority.
- Waits that campaign's configured delay (set per-campaign in the admin
  panel), then shows it as a closable modal with its photo or video,
  headline, body text, and an optional button.
- Remembers a dismissal according to the campaign's frequency setting
  (`once_per_session` → `sessionStorage`, `once_per_visitor` →
  `localStorage`, `every_visit` → never remembered) so it doesn't nag
  visitors. Dismissal is tracked per campaign id, so publishing a *new*
  campaign will show even if an older one was already dismissed.
- If the fetch fails for any reason, it silently does nothing — a broken
  popup should never take down the page.

## Styling

Inline styles, in the site's own navy/gold palette, so it works with zero
CSS setup. If the public site has its own design system, swap the `styles`
object at the bottom of the file for real CSS classes instead — the JSX
structure won't need to change.

## No CORS setup needed here

The admin panel's `/api/campaigns` route already allows
`https://stevenmoning.vercel.app` (see `lib/cors.ts` in this repo). If the
public site is served from a different origin, add it to that repo's
`CORS_ALLOWED_ORIGINS` env var.
