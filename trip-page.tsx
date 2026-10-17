import { notFound, redirect } from "next/navigation";
import { getUid } from "@/lib/session";
import { getTrip, listTrips } from "@/lib/store";
import Planner from "@/components/Planner";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getUid();
  if (!uid) redirect("/login");
  const trip = await getTrip(uid, id);
  if (!trip) notFound();
  const history = (await listTrips(uid)).filter((t) => t.id !== id);
  return <Planner trip={trip} history={history} mapKey={process.env.NEXT_PUBLIC_MAPTILER_KEY || ""} />;
}
