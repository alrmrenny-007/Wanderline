# Wanderline

Plan trips as glowing flight paths over Google's photorealistic 3D globe, then press **Play trip film** and the camera flies your route stop by stop.

**What makes it different**
- **Trip film**: a cinematic camera flight along your itinerary, heading-aware at every stop.
- **Floating arcs**: each leg lifts off the terrain, higher the farther you go.
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
Google Cloud: create an API key, enable **Maps JavaScript API** and **Map Tiles API**, and restrict the key to your domains.
Without `BLOB_READ_WRITE_TOKEN` the app stores data in memory (resets on restart), which is fine for trying it out.

## Deploy
Push to GitHub, import in Vercel, add a **Blob** store under Storage, and set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `AUTH_SECRET`.

Note: the 3D map uses the Maps JS `beta` channel (`maps3d`), whose API can change. Reordering uses HTML5 drag and drop (desktop); on touch, tap a card to select it.
