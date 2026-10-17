"use client";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Stop, Trip } from "@/lib/types";

const rad = (d: number) => (d * Math.PI) / 180;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type P = { lat: number; lng: number };

function dist(a: P, b: P) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
function bearing(a: P, b: P) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
// Great-circle path so legs curve the way real flights do on the globe.
function gc(a: P, b: P, n = 48): [number, number][] {
  const p1 = rad(a.lat), l1 = rad(a.lng), p2 = rad(b.lat), l2 = rad(b.lng);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-6 || Math.abs(Math.sin(d)) < 1e-6) return [[a.lng, a.lat], [b.lng, b.lat]];
  const out: [number, number][] = []; let prev = a.lng;
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    let lng = (Math.atan2(y, x) * 180) / Math.PI;
    const lat = (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI;
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    prev = lng; out.push([lng, lat]);
  }
  return out;
}
const legs = (s: P[]) => ({
  type: "FeatureCollection" as const,
  features: s.slice(0, -1).map((p, i) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: gc(p, s[i + 1]) } }))
});

export default function Planner({ trip, history, mapKey }: { trip: Trip; history: Trip[]; mapKey: string }) {
  const [title, setTitle] = useState(trip.title);
  const [stops, setStops] = useState<Stop[]>(trip.stops);
  const [sel, setSel] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("Saved");
  const [drag, setDrag] = useState<number | null>(null);

  const host = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const gl = useRef<any>(null);
  const pins = useRef<any[]>([]);
  const stopsRef = useRef(stops); stopsRef.current = stops;
  const playRef = useRef(false);
  const first = useRef(true);

  function addStop(lat: number, lng: number) {
    const s = stopsRef.current;
    const next = [...s, { id: crypto.randomUUID(), name: `Stop ${s.length + 1}`, lat, lng, note: "", photos: [] }];
    setStops(next); setSel(next.length - 1);
  }

  // Boot the globe.
  useEffect(() => {
    if (!mapKey) { setErr("Add NEXT_PUBLIC_MAPTILER_KEY in Vercel to load the globe."); return; }
    let dead = false;
    (async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (dead || !host.current) return;
        const f = trip.stops[0];
        const m = new maplibregl.Map({
          container: host.current,
          style: `https://api.maptiler.com/maps/hybrid/style.json?key=${mapKey}`,
          center: f ? [f.lng, f.lat] : [10, 20], zoom: f ? 3.2 : 1.3, pitch: f ? 40 : 0, bearing: 0,
          attributionControl: false, maxPitch: 75
        });
        m.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
        m.on("style.load", () => {
          m.setProjection({ type: "globe" });
          if (!m.getSource("terrain")) m.addSource("terrain", { type: "raster-dem", url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${mapKey}`, tileSize: 256 });
          m.setTerrain({ source: "terrain", exaggeration: 1.4 });
          const empty = { type: "FeatureCollection", features: [] };
          m.addSource("ghost", { type: "geojson", data: empty });
          m.addSource("route", { type: "geojson", data: empty });
          m.addLayer({ id: "ghost-line", type: "line", source: "ghost", paint: { "line-color": "#9db4ff", "line-opacity": 0.55, "line-width": 2 } });
          m.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round" }, paint: { "line-color": "#ffc24a", "line-opacity": 0.4, "line-width": 12, "line-blur": 8 } });
          m.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffc24a", "line-width": 3.5 } });
          setReady(true);
        });
        m.on("click", (e: any) => {
          if ((e.originalEvent.target as HTMLElement).closest(".pin")) return;
          addStop(e.lngLat.lat, e.lngLat.lng);
        });
        m.on("error", (e: any) => { if (e?.error?.status === 401 || e?.error?.status === 403) setErr("MapTiler rejected the key. Check NEXT_PUBLIC_MAPTILER_KEY and its allowed origins."); });
        gl.current = maplibregl; map.current = m;
      } catch {
        setErr("The map failed to load. Check your connection and NEXT_PUBLIC_MAPTILER_KEY.");
      }
    })();
    return () => { dead = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route and ghost trails.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m?.getSource("route")) return;
    m.getSource("route").setData(legs(stops));
    m.getSource("ghost").setData({ type: "FeatureCollection", features: history.flatMap((h) => legs(h.stops).features) });
  }, [stops, history, ready]);

  // Numbered pins.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    pins.current.forEach((p) => p.remove()); pins.current = [];
    stops.forEach((s, i) => {
      const el = document.createElement("button");
      el.className = `pin ${sel === i ? "on" : ""}`;
      el.textContent = String(i + 1);
      el.setAttribute("aria-label", s.name);
      el.onclick = () => { setSel(i); fly(i, 1800, 9); };
      pins.current.push(new gl.current.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, sel, ready]);

  // Autosave.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("Saving");
    const t = setTimeout(async () => {
      const r = await fetch(`/api/trips/${trip.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, stops }) });
      setStatus(r.ok ? "Saved" : "Not saved, check your connection");
    }, 800);
    return () => clearTimeout(t);
  }, [title, stops, trip.id]);

  function fly(i: number, ms = 3000, zoom = 10) {
    const s = stopsRef.current[i], n = stopsRef.current[i + 1];
    if (!s) return;
    map.current?.flyTo({ center: [s.lng, s.lat], zoom, pitch: 62, bearing: n ? bearing(s, n) : 0, duration: ms, essential: true });
  }

  async function film() {
    if (playRef.current) { playRef.current = false; setPlaying(false); map.current?.stop(); return; }
    if (!stopsRef.current.length) return;
    playRef.current = true; setPlaying(true);
    for (let i = 0; i < stopsRef.current.length && playRef.current; i++) {
      setSel(i);
      fly(i, i ? 5000 : 3000, 10);
      await sleep(i ? 6500 : 4500);
    }
    playRef.current = false; setPlaying(false);
  }

  function patch(i: number, p: Partial<Stop>) { setStops((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x))); }
  function remove(i: number) { setStops((s) => s.filter((_, j) => j !== i)); setSel(null); }
  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= stops.length) return;
    const a = [...stops]; [a[i], a[j]] = [a[j], a[i]];
    setStops(a); setSel(j);
  }
  function drop(to: number) {
    if (drag === null || drag === to) return;
    const a = [...stops]; const [m] = a.splice(drag, 1); a.splice(to, 0, m);
    setStops(a); setSel(to); setDrag(null);
  }
  async function upload(i: number, file: File) {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) { setStatus(j.error || "Upload failed"); return; }
    patch(i, { photos: [...stops[i].photos, j.url] });
  }

  const km = Math.round(stops.slice(0, -1).reduce((t, s, i) => t + dist(s, stops[i + 1]), 0) / 1000);
  const cur = sel !== null ? stops[sel] : null;

  return (
    <div className="stage">
      <div className="map"><div ref={host} style={{ width: "100%", height: "100%" }} /></div>
      {err && <div className="notice glass" role="alert">{err}</div>}

      <header className="hud top glass">
        <a href="/trips" className="back" aria-label="Back to your voyages">Trips</a>
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Trip title" maxLength={80} />
        <span className="save" aria-live="polite">{status}</span>
      </header>

      {ready && stops.length === 0 && <div className="hint glass">Tap anywhere on the globe to drop your first stop.</div>}

      {cur && sel !== null && (
        <aside className="sheet glass" aria-label={`Edit ${cur.name}`}>
          <div className="sheet-row">
            <input value={cur.name} onChange={(e) => patch(sel, { name: e.target.value })} aria-label="Stop name" maxLength={80} />
            <button className="link" onClick={() => setSel(null)}>Close</button>
          </div>
          <textarea value={cur.note} onChange={(e) => patch(sel, { note: e.target.value })} placeholder="Notes: what you'll do, where you'll sleep" rows={3} />
          <div className="photos">
            {cur.photos.map((u, k) => (
              <button key={k} className="ph" style={{ backgroundImage: `url(${u})` }} aria-label="Remove photo"
                onClick={() => patch(sel, { photos: cur.photos.filter((_, j) => j !== k) })} />
            ))}
            <label className="ph add">Add photo
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(sel, f); e.target.value = ""; }} />
            </label>
          </div>
          <div className="sheet-row">
            <button className="btn small" onClick={() => move(sel, -1)} disabled={sel === 0} aria-label="Move earlier in route">Earlier</button>
            <button className="btn small" onClick={() => move(sel, 1)} disabled={sel === stops.length - 1} aria-label="Move later in route">Later</button>
          </div>
          <div className="sheet-row">
            <button className="btn small" onClick={() => fly(sel, 2500, 12)}>Fly here</button>
            <button className="link danger" onClick={() => remove(sel)}>Delete stop</button>
          </div>
        </aside>
      )}

      <footer className="reel glass">
        <div className="reel-head">
          <button className="btn small" onClick={film} disabled={!stops.length}>{playing ? "Stop film" : "Play trip film"}</button>
          <span>{stops.length} {stops.length === 1 ? "stop" : "stops"}, {km.toLocaleString()} km of route</span>
        </div>
        <ol className="strip">
          {stops.map((s, i) => (
            <li key={s.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)} onDragEnd={() => setDrag(null)}
              className={`card ${sel === i ? "on" : ""} ${drag === i ? "lifting" : ""}`}>
              <button onClick={() => { setSel(i); fly(i, 2200, 8); }}>
                <b>{i + 1}</b><span>{s.name}</span>
              </button>
            </li>
          ))}
          {stops.length > 1 && <li className="tip">Drag cards to reorder the route</li>}
        </ol>
      </footer>
    </div>
  );
}
