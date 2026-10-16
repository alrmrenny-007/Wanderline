import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getUid } from "@/lib/session";
import { listTrips, saveTrip } from "@/lib/store";

export async function GET() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listTrips(uid));
}

export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { title } = await req.json().catch(() => ({ title: "" }));
  const trip = { id: randomUUID().replace(/-/g, "").slice(0, 12), owner: uid, title: String(title || "Untitled voyage").slice(0, 80), createdAt: Date.now(), stops: [] };
  await saveTrip(trip);
  return NextResponse.json(trip);
}
