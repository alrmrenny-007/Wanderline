import { redirect } from "next/navigation";
import { getUid } from "@/lib/session";
import { getTrip, listTrips } from "@/lib/store";
import Planner from "@/components/Planner";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getUid();
  if (!uid) redirect("/login");
  // The planner falls back to this device's saved copy if the server has none.
  const trip = await getTrip(uid, id);
  const history = (await listTrips(uid)).filter((t) => t.id !== id);
  return <Planner id={id} trip={trip} history={history} mapKey={process.env.NEXT_PUBLIC_MAPTILER_KEY || ""} />;
}
