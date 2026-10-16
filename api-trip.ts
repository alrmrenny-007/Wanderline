import { NextResponse } from "next/server";
import { getUid } from "@/lib/session";
import { deleteTrip, getTrip, saveTrip } from "@/lib/store";
import type { Stop } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const uid = await getUid(); const { id } = await params;
  const trip = uid && (await getTrip(uid, id));
  return trip ? NextResponse.json(trip) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const uid = await getUid(); const { id } = await params;
  const trip = uid && (await getTrip(uid, id));
  if (!uid || !trip) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  const stops: Stop[] = (Array.isArray(body.stops) ? body.stops : []).slice(0, 200).map((s: Stop) => ({
    id: String(s.id), name: String(s.name || "").slice(0, 80), lat: Number(s.lat), lng: Number(s.lng),
    note: String(s.note || "").slice(0, 1000), photos: (s.photos || []).slice(0, 12).map(String)
  }));
  const next = { ...trip, title: String(body.title || trip.title).slice(0, 80), stops };
  await saveTrip(next);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const uid = await getUid(); const { id } = await params;
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await deleteTrip(uid, id);
  return NextResponse.json({ ok: true });
}
