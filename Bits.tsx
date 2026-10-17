"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Stop, Trip } from "@/lib/types";

export function NewTripButton() {
  const router = useRouter();
  return (
    <button className="btn" onClick={async () => {
      let t: Trip | null = null;
      try {
        const r = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (r.ok) t = await r.json();
      } catch {}
      if (!t) t = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 12), owner: "local", title: "Untitled voyage", createdAt: Date.now(), stops: [] };
      try { localStorage.setItem(`wl:trip:${t.id}`, JSON.stringify(t)); } catch {}
      router.push(`/trips/${t.id}`);
    }}>Start a trip</button>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="link" onClick={async () => { await fetch("/api/auth", { method: "DELETE" }); router.push("/login"); router.refresh(); }}>
      Sign out
    </button>
  );
}

function Sketch({ stops }: { stops: Stop[] }) {
  if (stops.length === 0)
    return (
      <svg viewBox="0 0 120 50" className="sketch" aria-hidden="true">
        <path d="M6 42 Q60 -12 114 38" fill="none" stroke="#9db4ff" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" />
      </svg>
    );
  const lngs = stops.map((s) => s.lng), lats = stops.map((s) => s.lat);
  const minX = Math.min(...lngs), minY = Math.min(...lats);
  const w = Math.max(...lngs) - minX || 1, h = Math.max(...lats) - minY || 1;
  const pts = stops.map((s) => [stops.length === 1 ? 60 : 10 + ((s.lng - minX) / w) * 100, stops.length === 1 ? 25 : 42 - ((s.lat - minY) / h) * 34]);
  return (
    <svg viewBox="0 0 120 50" className="sketch" aria-hidden="true">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#ffc24a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#ffc24a" />)}
    </svg>
  );
}

export function TripShelf({ serverTrips }: { serverTrips: Trip[] }) {
  const [trips, setTrips] = useState<Trip[]>(serverTrips);
  useEffect(() => {
    const m = new Map(serverTrips.map((t) => [t.id, t]));
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("wl:trip:")) {
          const o = JSON.parse(localStorage.getItem(k) || "null");
          if (o?.id) m.set(o.id, o);
        }
      }
    } catch {}
    setTrips([...m.values()].sort((a, b) => b.createdAt - a.createdAt));
  }, [serverTrips]);

  if (!trips.length)
    return (
      <section className="empty glass">
        <svg viewBox="0 0 300 120" aria-hidden="true">
          <circle cx="150" cy="150" r="130" fill="none" stroke="#9db4ff" strokeOpacity=".25" />
          <circle cx="150" cy="150" r="95" fill="none" stroke="#9db4ff" strokeOpacity=".18" />
          <path d="M40 100 Q150 -30 260 90" fill="none" stroke="#ffc24a" strokeWidth="3" strokeDasharray="1 8" strokeLinecap="round" />
          <circle cx="40" cy="100" r="6" fill="#ffc24a" /><circle cx="260" cy="90" r="6" fill="#ffc24a" />
        </svg>
        <h2>Where to first?</h2>
        <p>Drop stops on a 3D globe, watch the route glow, then play it back as a film.</p>
      </section>
    );

  return (
    <ul className="trips">
      {trips.map((t) => (
        <li key={t.id}>
          <Link href={`/trips/${t.id}`} className="trip glass">
            <Sketch stops={t.stops} />
            <strong>{t.title}</strong>
            <span>{t.stops.length} {t.stops.length === 1 ? "stop" : "stops"}{t.stops[0] ? `, from ${t.stops[0].name}` : ""}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
