"use client";
import { useEffect, useRef, useState } from "react";
import type { Stop, Trip } from "@/lib/types";

declare global { interface Window { google: any; __wlMaps?: Promise<void> } }

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
// A leg is drawn as a floating arc: the farther the stops, the higher it climbs.
function arc(a: P, b: P) {
  const d = dist(a, b), N = 32, out = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, altitude: Math.sin(Math.PI * t) * d * 0.14 + 30 });
  }
  return out;
}

function loadMaps(key: string) {
  if (window.__wlMaps) return window.__wlMaps;
  window.__wlMaps = new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=beta&libraries=maps3d&loading=async`;
    s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("maps"));
    document.head.appendChild(s);
  });
  return window.__wlMaps;
}

export default function Planner({ trip, history, mapsKey }: { trip: Trip; history: Trip[]; mapsKey: string }) {
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
  const lib = useRef<any>(null);
  const layers = useRef<any[]>([]);
  const stopsRef = useRef(stops); stopsRef.current = stops;
  const playRef = useRef(false);
  const first = useRef(true);

  function addStop(lat: number, lng: number) {
    const s = stopsRef.current;
    const next = [...s, { id: crypto.randomUUID(), name: `Stop ${s.length + 1}`, lat, lng, note: "", photos: [] }];
    setStops(next); setSel(next.length - 1);
  }

  // Boot the 3D map.
  useEffect(() => {
    if (!mapsKey) { setErr("Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your environment to load the 3D globe."); return; }
    let dead = false;
    (async () => {
      try {
        await loadMaps(mapsKey);
        const L = await window.google.maps.importLibrary("maps3d");
        if (dead) return;
        const f = trip.stops[0];
        const m = new L.Map3DElement({
          center: { lat: f?.lat ?? 20, lng: f?.lng ?? 0, altitude: 0 },
          range: f ? 2_500_000 : 18_000_000, tilt: f ? 55 : 0, heading: 0, mode: "HYBRID"
        });
        m.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
        m.addEventListener("gmp-click", (e: any) => { if (e.position) addStop(e.position.lat, e.position.lng); });
        host.current!.appendChild(m);
        map.current = m; lib.current = L; setReady(true);
      } catch {
        setErr("The 3D map failed to load. Check your API key, and enable Maps JavaScript API and Map Tiles API.");
      }
    })();
    return () => { dead = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw ghost trails (past trips), this trip's arcs, and numbered markers.
  useEffect(() => {
    const m = map.current, L = lib.current;
    if (!m || !L) return;
    layers.current.forEach((e) => e.remove()); layers.current = [];
    const add = (e: any) => { m.append(e); layers.current.push(e); };
    history.forEach((h) => {
      if (h.stops.length < 2) return;
      const path = h.stops.slice(0, -1).flatMap((s, i) => arc(s, h.stops[i + 1]));
      add(new L.Polyline3DElement({ path, strokeColor: "rgba(157,180,255,0.45)", strokeWidth: 3, altitudeMode: "ABSOLUTE" }));
    });
    for (let i = 0; i < stops.length - 1; i++)
      add(new L.Polyline3DElement({ path: arc(stops[i], stops[i + 1]), strokeColor: "#ffc24a", strokeWidth: 8, altitudeMode: "ABSOLUTE" }));
    stops.forEach((s, i) =>
      add(new L.Marker3DElement({ position: { lat: s.lat, lng: s.lng, altitude: 0 }, label: String(i + 1), altitudeMode: "RELATIVE_TO_GROUND", extruded: true }))
    );
  }, [stops, history, ready]);

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

  function fly(i: number, ms = 3000, range = 1800) {
    const s = stopsRef.current[i], n = stopsRef.current[i + 1];
    if (!s) return;
    map.current?.flyCameraTo({ endCamera: { center: { lat: s.lat, lng: s.lng, altitude: 0 }, tilt: 62, heading: n ? bearing(s, n) : 0, range }, durationMillis: ms });
  }

  async function film() {
    if (playRef.current) { playRef.current = false; setPlaying(false); map.current?.stopCameraAnimation?.(); return; }
    if (!stopsRef.current.length) return;
    playRef.current = true; setPlaying(true);
    for (let i = 0; i < stopsRef.current.length && playRef.current; i++) {
      setSel(i);
      fly(i, i ? 5000 : 3000);
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
      <div ref={host} className="map" />
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
            <button className="btn small" onClick={() => fly(sel, 2500, 1200)}>Fly here</button>
            <button className="link danger" onClick={() => remove(sel)}>Delete stop</button>
          </div>
        </aside>
      )}

      <footer className="reel glass">
        <div className="reel-head">
          <button className="btn small" onClick={film} disabled={!stops.length}>{playing ? "Stop film" : "Play trip film"}</button>
          <span>{stops.length} {stops.length === 1 ? "stop" : "stops"}, {km.toLocaleString()} km in the air</span>
        </div>
        <ol className="strip">
          {stops.map((s, i) => (
            <li key={s.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)} onDragEnd={() => setDrag(null)}
              className={`card ${sel === i ? "on" : ""} ${drag === i ? "lifting" : ""}`}>
              <button onClick={() => { setSel(i); fly(i, 2200, 2500); }}>
                <b>{i + 1}</b><span>{s.name}</span>
              </button>
            </li>
          ))}
          {stops.length > 1 && <li className="tip">Tap a card, then use Earlier or Later to reorder</li>}
        </ol>
      </footer>
    </div>
  );
}
