import Link from "next/link";
import { redirect } from "next/navigation";
import { getUid } from "@/lib/session";
import { listTrips } from "@/lib/store";
import { NewTripButton } from "@/components/Bits";

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
      {trips.length === 0 ? (
        <p className="empty">No trips yet. Start one, then tap the globe to drop your first stop.</p>
      ) : (
        <ul className="trips">
          {trips.map((t) => (
            <li key={t.id}>
              <Link href={`/trips/${t.id}`} className="trip glass">
                <strong>{t.title}</strong>
                <span>{t.stops.length} {t.stops.length === 1 ? "stop" : "stops"}{t.stops[0] ? `, from ${t.stops[0].name}` : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
