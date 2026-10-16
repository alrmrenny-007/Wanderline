// Next.js needs folders (app/, lib/, components/) to route pages.
// This repo stays completely flat; this script builds those folders on dev/build.
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";

const map = {
  "layout.tsx": "app/layout.tsx",
  "globals.css": "app/globals.css",
  "home-page.tsx": "app/page.tsx",
  "login-page.tsx": "app/(auth)/login/page.tsx",
  "dashboard-layout.tsx": "app/(dashboard)/layout.tsx",
  "trips-page.tsx": "app/(dashboard)/trips/page.tsx",
  "trip-page.tsx": "app/(dashboard)/trips/[id]/page.tsx",
  "api-auth.ts": "app/api/auth/route.ts",
  "api-trips.ts": "app/api/trips/route.ts",
  "api-trip.ts": "app/api/trips/[id]/route.ts",
  "api-upload.ts": "app/api/upload/route.ts",
  "Planner.tsx": "components/Planner.tsx",
  "Bits.tsx": "components/Bits.tsx",
  "types.ts": "lib/types.ts",
  "session.ts": "lib/session.ts",
  "store.ts": "lib/store.ts"
};

for (const [from, to] of Object.entries(map)) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log("Wanderline: folders generated.");
