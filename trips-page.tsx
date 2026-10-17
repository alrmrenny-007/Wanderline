import { redirect } from "next/navigation";
import { getUid } from "@/lib/session";
import { listTrips } from "@/lib/store";
import { NewTripButton, TripShelf } from "@/components/Bits";

export const dynamic = "force-dynamic";

export default async function Trips() {
  const uid = await getUid();
  if (!uid) redirect("/login");
  const trips = await listTrips(uid);
  return (
    <main className="shelf">
      <header className="shelf-head">
        <h1>Your voyages</h1>
        <NewTripButton />
      </header>
      <TripShelf serverTrips={trips} />
    </main>
  );
}
