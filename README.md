# Wanderline

Plan trips as glowing flight paths over a 3D satellite globe (MapLibre + MapTiler), then press **Play trip film** and the camera flies your route stop by stop.

**What makes it different**
- **Trip film**: a cinematic camera flight along your itinerary, heading-aware at every stop.
- **Great-circle legs**: each leg curves the way a real flight does across the globe, with a glow.
- **Ghost trails**: every past trip stays on the globe as a faint blue path, so your travel history becomes a shared canvas.
- **Drag the timeline**: reorder stops by dragging cards; the route re-draws instantly.
- **Stop photos**: uploaded through a Next.js route handler to Vercel Blob.

**Next.js features**: route groups `(auth)` and `(dashboard)` with `middleware.ts` gating, async `params`, route handlers, server components reading storage directly.

## Flat repo
Every file lives at the repo root. `setup.mjs` runs automatically before `dev` and `build` and generates the `app/`, `lib/` and `components/` folders Next.js needs. Edit the flat files, never the generated folders. Filenames map like `login-page.tsx` to `app/(auth)/login/page.tsx` (see `setup.mjs`).

## Run it
```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```
Get a free key at cloud.maptiler.com (no card needed) and set it as `NEXT_PUBLIC_MAPTILER_KEY`. Under the key's settings, allow your site's domain.
Without `BLOB_READ_WRITE_TOKEN` the app stores data in memory (resets on restart), which is fine for trying it out.

## Deploy
Push to GitHub, import in Vercel, add a **Blob** store under Storage, and set `NEXT_PUBLIC_MAPTILER_KEY` and `AUTH_SECRET`.

Reordering uses HTML5 drag and drop (desktop); on touch, tap a card to select it.
