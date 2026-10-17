"use client";
import { useEffect, useRef, useState } from "react";
import type { Stop, Trip } from "@/lib/types";

type P = { lat: number; lng: number };
type Pt = [number, number];
type V = { lng: number; lat: number; k: number }; // view: centre + pixels per degree
type Film = { leg: number; t: number; at: P } | null;
type Hit = { id?: number; name: string; admin1?: string; country?: string; latitude: number; longitude: number };

const SODIUM = "#ffc24a";
const LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json";
const rad = (d: number) => (d * Math.PI) / 180;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function dist(a: P, b: P) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
// Great-circle path, longitudes unwrapped so lines never jump across the map.
function gc(a: P, b: P, n = 48): Pt[] {
  const p1 = rad(a.lat), l1 = rad(a.lng), p2 = rad(b.lat), l2 = rad(b.lng);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-6 || Math.abs(Math.sin(d)) < 1e-6) return [[a.lng, a.lat], [b.lng, b.lat]];
  const out: Pt[] = []; let prev = a.lng;
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
function along(path: Pt[], t: number) {
  const f = clamp(t, 0, 1) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f)), u = f - i;
  const a = path[i], b = path[i + 1];
  return { i, pt: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u] as Pt };
}
function fitView(pts: P[], w: number, h: number, pad: number): V {
  if (!pts.length) return { lng: 10, lat: 20, k: Math.max(h / 190, w / 200) };
  const lngs = pts.map((p) => p.lng), lats = pts.map((p) => p.lat);
  const minX = Math.min(...lngs), maxX = Math.max(...lngs), minY = Math.min(...lats), maxY = Math.max(...lats);
  const dx = Math.max(maxX - minX, 0.5), dy = Math.max(maxY - minY, 0.5);
  const k = pts.length === 1 ? 12 : clamp(Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dy), w / 360, 60);
  return { lng: (minX + maxX) / 2, lat: (minY + maxY) / 2, k };
}

// ---- World outline: TopoJSON from a public CDN, decoded by hand (no libraries).
let LAND: Pt[][][] = [];
let landP: Promise<void> | null = null;
function decode(topo: any): Pt[][][] {
  const q = !!topo.transform;
  const [sx, sy] = q ? topo.transform.scale : [1, 1], [tx, ty] = q ? topo.transform.translate : [0, 0];
  const arcs: Pt[][] = topo.arcs.map((a: number[][]) => {
    let x = 0, y = 0;
    return a.map(([dx, dy]) => { if (q) { x += dx; y += dy; return [x * sx + tx, y * sy + ty] as Pt; } return [dx, dy] as Pt; });
  });
  const ring = (ids: number[]) => {
    const out: Pt[] = [];
    for (const i of ids) { const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); out.push(...(out.length ? a.slice(1) : a)); }
    return out;
  };
  const polys: Pt[][][] = [];
  const walk = (g: any) => {
    if (g.type === "GeometryCollection") g.geometries.forEach(walk);
    else if (g.type === "Polygon") polys.push(g.arcs.map(ring));
    else if (g.type === "MultiPolygon") g.arcs.forEach((p: number[][]) => polys.push(p.map(ring)));
  };
  Object.values(topo.objects).forEach(walk);
  return polys;
}
function loadLand() {
  landP ??= fetch(LAND_URL).then((r) => r.json()).then((t) => { LAND = decode(t); });
  return landP;
}

let PAT: HTMLCanvasElement | null = null;
function dots(ctx: CanvasRenderingContext2D) {
  if (!PAT) {
    PAT = document.createElement("canvas"); PAT.width = PAT.height = 6;
    const c = PAT.getContext("2d")!;
    c.fillStyle = "rgba(205,218,255,.6)"; c.beginPath(); c.arc(3, 3, 1.2, 0, 7); c.fill();
  }
  return ctx.createPattern(PAT, "repeat")!;
}

// ---- Painter (used for the live map and for the shareable poster).
function render(ctx: CanvasRenderingContext2D, w: number, h: number, v: V,
  o: { stops: Stop[]; ghosts: Trip[]; sel: number | null; film: Film; labels: "sel" | "all"; s?: number }) {
  const s = o.s ?? 1;
  const X = (lng: number) => (lng - v.lng) * v.k + w / 2;
  const Y = (lat: number) => (v.lat - lat) * v.k + h / 2;
  const OFF = [-360, 0, 360];

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0c1733"); bg.addColorStop(1, "#060b18");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  ctx.lineWidth = 1; ctx.strokeStyle = "rgba(157,180,255,.08)"; ctx.beginPath();
  for (let g = -540; g <= 540; g += 30) { const x = X(g); ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let g = -90; g <= 90; g += 30) { const y = Y(g); ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();

  if (LAND.length) {
    for (const off of OFF) {
      if (X(180 + off) < 0 || X(-180 + off) > w) continue;
      ctx.beginPath();
      for (const poly of LAND) for (const r of poly) {
        r.forEach(([lng, lat], i) => { const x = X(lng + off), y = Y(lat); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath();
      }
      ctx.fillStyle = "rgba(157,180,255,.09)"; ctx.fill("evenodd");
      ctx.fillStyle = dots(ctx); ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(157,180,255,.42)"; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }

  const stroke = (pts: Pt[], color: string, lw: number, dash: number[] = []) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash(dash);
    for (const off of OFF) {
      ctx.beginPath();
      pts.forEach(([lng, lat], i) => { const x = X(lng + off), y = Y(lat); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  o.ghosts.forEach((t) => t.stops.slice(0, -1).forEach((a, i) => stroke(gc(a, t.stops[i + 1], 32), "rgba(157,180,255,.4)", 1.6 * s, [4 * s, 6 * s])));

  const S = o.stops;
  for (let i = 0; i < S.length - 1; i++) {
    const path = gc(S[i], S[i + 1]);
    const lit = o.film ? (i < o.film.leg ? 1 : i === o.film.leg ? o.film.t : 0) : 1;
    if (lit < 1) stroke(path, "rgba(255,194,74,.28)", 2 * s, [3 * s, 7 * s]);
    if (lit > 0) {
      const { i: idx, pt } = along(path, lit);
      const part = lit >= 1 ? path : [...path.slice(0, idx + 1), pt];
      stroke(part, "rgba(255,194,74,.2)", 10 * s);
      stroke(part, SODIUM, 3 * s);
    }
  }

  const R = 13 * s;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  S.forEach((st, i) => {
    const x = X(st.lng), y = Y(st.lat);
    if (x < -60 || x > w + 60 || y < -60 || y > h + 60) return;
    if (o.sel === i) { ctx.beginPath(); ctx.arc(x, y, R + 7 * s, 0, 7); ctx.strokeStyle = "rgba(255,194,74,.6)"; ctx.lineWidth = 3 * s; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fillStyle = SODIUM; ctx.fill();
    ctx.lineWidth = 2 * s; ctx.strokeStyle = "#1a1200"; ctx.stroke();
    ctx.fillStyle = "#1a1200"; ctx.font = `700 ${12 * s}px system-ui, sans-serif`; ctx.fillText(String(i + 1), x, y + 0.5);
    if (o.labels === "all" || o.sel === i) {
      const t = st.name.length > 18 ? st.name.slice(0, 17) + "…" : st.name;
      ctx.font = `600 ${13 * s}px system-ui, sans-serif`; ctx.lineWidth = 4 * s; ctx.strokeStyle = "rgba(6,11,24,.9)";
      ctx.strokeText(t, x, y + R + 14 * s); ctx.fillStyle = "#e9eefc"; ctx.fillText(t, x, y + R + 14 * s);
    }
  });

  if (o.film) {
    const x = X(o.film.at.lng), y = Y(o.film.at.lat);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 22 * s);
    g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(0.25, "rgba(255,194,74,.8)"); g.addColorStop(1, "rgba(255,194,74,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22 * s, 0, 7); ctx.fill();
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(/\s{2,}|\s/); let line = "", n = 0;
  for (const wd of words) {
    const test = line ? line + " " + wd : wd;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y + n * lh); line = wd; if (++n >= maxLines) return; }
    else line = test;
  }
  if (line && n < maxLines) ctx.fillText(line, x, y + n * lh);
}

export default function Planner({ id, trip, history }: { id: string; trip: Trip | null; history: Trip[]; mapKey?: string }) {
  const [title, setTitle] = useState(trip?.title ?? "Untitled voyage");
  const [stops, setStops] = useState<Stop[]>(trip?.stops ?? []);
  const [sel, setSel] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("Saved");
  const [drag, setDrag] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [missing, setMissing] = useState(false);
  const [ghosts, setGhosts] = useState<Trip[]>(history);
  const [landReady, setLandReady] = useState(false);
  const [sizeReady, setSizeReady] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<V>({ lng: 10, lat: 20, k: 4 });
  const size = useRef({ w: 360, h: 640, dpr: 1 });
  const stopsRef = useRef(stops); stopsRef.current = stops;
  const selRef = useRef(sel); selRef.current = sel;
  const ghostsRef = useRef(ghosts); ghostsRef.current = ghosts;
  const filmRef = useRef<Film>(null);
  const playRef = useRef(false);
  const animTok = useRef(0);
  const dirty = useRef(false);
  const inited = useRef(false);
  const created = useRef(Date.now());
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const tap = useRef({ x: 0, y: 0, t: 0, moved: false });

  function paint() {
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const { w, h, dpr } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx, w, h, view.current, { stops: stopsRef.current, ghosts: ghostsRef.current, sel: selRef.current, film: filmRef.current, labels: "sel" });
  }
  function redraw() {
    if (dirty.current) return;
    dirty.current = true;
    requestAnimationFrame(() => { dirty.current = false; paint(); });
  }
  function clampView() {
    const v = view.current;
    v.lat = clamp(v.lat, -85, 85); v.k = clamp(v.k, size.current.w / 360, 60);
    if (!playRef.current) { while (v.lng > 180) v.lng -= 360; while (v.lng < -180) v.lng += 360; }
  }
  function zoomAbout(px: number, py: number, f: number) {
    const { w, h } = size.current, v = view.current;
    const lng = v.lng + (px - w / 2) / v.k, lat = v.lat - (py - h / 2) / v.k;
    v.k = clamp(v.k * f, w / 360, 60);
    v.lng = lng - (px - w / 2) / v.k; v.lat = lat + (py - h / 2) / v.k;
  }
  function flyTo(lng: number, lat: number, k: number, ms = 900) {
    const tok = ++animTok.current, a = { ...view.current }, t0 = performance.now();
    return new Promise<void>((res) => {
      const step = (now: number) => {
        if (tok !== animTok.current) { res(); return; }
        const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        view.current = { lng: a.lng + (lng - a.lng) * e, lat: a.lat + (lat - a.lat) * e, k: Math.exp(Math.log(a.k) + (Math.log(k) - Math.log(a.k)) * e) };
        paint();
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  // ---- Stops
  async function nameIt(sid: string, lat: number, lng: number) {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
      const j = await r.json();
      const n = j.city || j.locality || j.principalSubdivision || j.countryName;
      if (n) setStops((s) => s.map((x) => (x.id === sid && /^Stop \d+$/.test(x.name) ? { ...x, name: n } : x)));
    } catch {}
  }
  function addStop(lat: number, lng: number, name?: string) {
    const S = stopsRef.current;
    const st: Stop = { id: crypto.randomUUID(), name: name || `Stop ${S.length + 1}`, lat, lng, note: "", photos: [] };
    const next = [...S, st];
    stopsRef.current = next; setStops(next); setSel(next.length - 1);
    if (!name) nameIt(st.id, lat, lng);
  }
  function patch(i: number, p: Partial<Stop>) { setStops((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x))); }
  function remove(i: number) { setStops((s) => s.filter((_, j) => j !== i)); setSel(null); }
  function move(i: number, by: number) {
    const j = i + by; if (j < 0 || j >= stops.length) return;
    const a = [...stops]; [a[i], a[j]] = [a[j], a[i]]; setStops(a); setSel(j);
  }
  function drop(to: number) {
    if (drag === null || drag === to) return;
    const a = [...stops]; const [m] = a.splice(drag, 1); a.splice(to, 0, m); setStops(a); setSel(to); setDrag(null);
  }
  function focus(i: number, k = 8) { const s = stopsRef.current[i]; if (s) flyTo(s.lng, s.lat, Math.max(view.current.k, k)); }

  // ---- Touch / mouse
  type PE = React.PointerEvent<HTMLCanvasElement>;
  const pos = (e: PE) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function onDown(e: PE) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e); ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) tap.current = { ...p, t: Date.now(), moved: false }; else tap.current.moved = true;
    animTok.current++;
  }
  function onMove(e: PE) {
    const prev = ptrs.current.get(e.pointerId); if (!prev) return;
    const p = pos(e), v = view.current;
    if (ptrs.current.size === 1) {
      if (Math.hypot(p.x - tap.current.x, p.y - tap.current.y) > 8) tap.current.moved = true;
      if (tap.current.moved) { v.lng -= (p.x - prev.x) / v.k; v.lat += (p.y - prev.y) / v.k; }
    } else if (ptrs.current.size === 2) {
      const other = [...ptrs.current.entries()].find(([k]) => k !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y) || 1, d1 = Math.hypot(p.x - other.x, p.y - other.y);
      const m0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }, m1 = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
      v.lng -= (m1.x - m0.x) / v.k; v.lat += (m1.y - m0.y) / v.k;
      zoomAbout(m1.x, m1.y, d1 / d0);
    }
    ptrs.current.set(e.pointerId, p); clampView(); redraw();
  }
  function onUp(e: PE) {
    const wasTap = ptrs.current.size === 1 && !tap.current.moved && Date.now() - tap.current.t < 600;
    const p = pos(e); ptrs.current.delete(e.pointerId);
    if (wasTap) handleTap(p.x, p.y);
  }
  function handleTap(x: number, y: number) {
    if (playRef.current) { stopFilm(); return; }
    const { w, h } = size.current, v = view.current, S = stopsRef.current;
    for (let i = 0; i < S.length; i++) {
      const px = (S[i].lng - v.lng) * v.k + w / 2, py = (v.lat - S[i].lat) * v.k + h / 2;
      if (Math.hypot(px - x, py - y) < 26) { setSel(i); return; }
    }
    let lng = v.lng + (x - w / 2) / v.k; const lat = v.lat - (y - h / 2) / v.k;
    while (lng > 180) lng -= 360; while (lng < -180) lng += 360;
    if (Math.abs(lat) > 84) return;
    addStop(lat, lng);
  }

  // ---- Trip film
  function stopFilm() { playRef.current = false; setPlaying(false); filmRef.current = null; setCaption(null); animTok.current++; clampView(); redraw(); }
  async function film() {
    if (playRef.current) { stopFilm(); return; }
    const S = stopsRef.current; if (!S.length) return;
    playRef.current = true; setPlaying(true); setSel(null);
    const { w, h } = size.current;
    filmRef.current = { leg: 0, t: 0, at: S[0] };
    setCaption(`1. ${S[0].name}`);
    await flyTo(S[0].lng, S[0].lat, 10, 1400);
    for (let i = 0; i < S.length - 1 && playRef.current; i++) {
      const a = S[i], b = S[i + 1], path = gc(a, b, 64);
      const kFit = fitView([a, b], w, h - 220, 70).k, kHigh = Math.max(kFit, Math.min(10, kFit * 4));
      const ms = clamp(2600 + dist(a, b) / 1000 * 0.45, 3200, 8000);
      setCaption(`${i + 1}. ${a.name}`);
      await new Promise<void>((res) => {
        const t0 = performance.now();
        const step = (now: number) => {
          if (!playRef.current) { res(); return; }
          const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const { pt } = along(path, e);
          filmRef.current = { leg: i, t: e, at: { lng: pt[0], lat: pt[1] } };
          const k = Math.exp(Math.log(kHigh) + (Math.log(kFit) - Math.log(kHigh)) * Math.sin(Math.PI * e));
          view.current = { lng: pt[0], lat: pt[1], k }; paint();
          if (t < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
      if (!playRef.current) return;
      setCaption(`${i + 2}. ${b.name}`);
      await sleep(900);
    }
    if (playRef.current) stopFilm();
  }

  // ---- Poster
  async function poster() {
    const S = stopsRef.current; if (!S.length) return;
    setStatus("Making poster");
    const W = 1080, H = 1350, MH = Math.round(H * 0.74);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    const f = fitView(S, W, MH, 130), k = Math.min(f.k, 30);
    render(ctx, W, H, { lng: f.lng, lat: f.lat - (H - MH) / (2 * k), k }, { stops: S, ghosts: [], sel: null, film: null, labels: "all", s: 2.2 });
    const g = ctx.createLinearGradient(0, H * 0.6, 0, H);
    g.addColorStop(0, "rgba(6,11,24,0)"); g.addColorStop(0.35, "rgba(6,11,24,.92)"); g.addColorStop(1, "#060b18");
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e9eefc"; ctx.font = "600 76px Georgia, serif"; ctx.fillText(title.slice(0, 26), 80, H - 290);
    ctx.fillStyle = SODIUM; ctx.font = "600 34px system-ui, sans-serif";
    ctx.fillText(`${S.length} stops · ${km.toLocaleString()} km · ${(km / 40075).toFixed(2)}× around the world`, 80, H - 230);
    ctx.fillStyle = "#9aa6c4"; ctx.font = "400 30px system-ui, sans-serif";
    wrapText(ctx, S.map((s, i) => `${i + 1} ${s.name}`).join("  "), 80, H - 170, W - 160, 42, 3);
    ctx.fillStyle = SODIUM; ctx.font = "600 28px Georgia, serif"; ctx.fillText("Wanderline", 80, H - 50);
    try {
      const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej()), "image/png"));
      const file = new File([blob], `${title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "trip"}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      setStatus("Poster ready");
    } catch { setStatus("Poster cancelled"); }
  }

  // ---- Photos
  async function shrink(file: File): Promise<File> {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      const b: Blob = await new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej()), "image/jpeg", 0.72));
      return new File([b], "photo.jpg", { type: "image/jpeg" });
    } catch { return file; }
  }
  async function upload(i: number, file: File) {
    setStatus("Uploading photo");
    const fd = new FormData(); fd.append("file", await shrink(file));
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setStatus(j.error || "Upload failed"); return; }
    patch(i, { photos: [...stops[i].photos, j.url] });
  }

  // ---- Effects
  useEffect(() => { // saved copy on this device
    try {
      const raw = localStorage.getItem(`wl:trip:${id}`);
      const t: Trip | null = raw ? JSON.parse(raw) : trip;
      if (t) { setTitle(t.title); setStops(t.stops); stopsRef.current = t.stops; created.current = t.createdAt; } else setMissing(true);
      const others: Trip[] = [...history];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("wl:trip:") && k !== `wl:trip:${id}`) {
          const o = JSON.parse(localStorage.getItem(k) || "null");
          if (o?.id && !others.some((x) => x.id === o.id)) others.push(o);
        }
      }
      setGhosts(others);
    } catch { if (!trip) setMissing(true); }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { loadLand().then(() => setLandReady(true)).catch(() => setErr("Couldn't load the world outline. You can still search places and plan.")); }, []);

  useEffect(() => { // canvas size
    const el = wrap.current, c = canvas.current; if (!el || !c) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { w: r.width, h: r.height, dpr };
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      setSizeReady(true); redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { // first camera position
    if (!hydrated || missing || !sizeReady || inited.current) return;
    inited.current = true;
    const { w, h } = size.current;
    view.current = fitView(stopsRef.current, w, h - 160, 80);
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, missing, sizeReady]);

  useEffect(() => { redraw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stops, sel, ghosts, landReady, sizeReady]);

  useEffect(() => { // autosave: this device always, server when it can
    if (!hydrated || missing) return;
    const t = setTimeout(async () => {
      setStatus("Saving");
      try { localStorage.setItem(`wl:trip:${id}`, JSON.stringify({ id, owner: trip?.owner ?? "local", createdAt: created.current, title, stops })); } catch {}
      try {
        const r = await fetch(`/api/trips/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, stops }) });
        setStatus(r.ok ? "Saved" : "Saved on this device");
      } catch { setStatus("Saved on this device"); }
    }, 800);
    return () => clearTimeout(t);
  }, [title, stops, id, hydrated, missing, trip?.owner]);

  useEffect(() => { // place search (Open-Meteo geocoding, no key)
    const t = q.trim();
    if (t.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t)}&count=6&language=en&format=json`);
        setResults((await r.json()).results || []);
      } catch { setResults([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  function pick(h: Hit) {
    addStop(h.latitude, h.longitude, h.name);
    flyTo(h.longitude, h.latitude, Math.max(view.current.k, 9), 1200);
    setQ(""); setResults([]);
  }

  const km = Math.round(stops.slice(0, -1).reduce((t, s, i) => t + dist(s, stops[i + 1]), 0) / 1000);
  const cur = sel !== null ? stops[sel] : null;

  if (missing)
    return (
      <main className="gate">
        <h1>Trip not found</h1>
        <p className="lede">This trip isn't saved on the server or on this device.</p>
        <a className="btn" href="/trips">Back to your voyages</a>
      </main>
    );

  return (
    <div className="stage">
      <div className="map" ref={wrap}>
        <canvas ref={canvas} aria-label="World map. Tap to add a stop, drag to pan, pinch to zoom."
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={(e) => ptrs.current.delete(e.pointerId)}
          onWheel={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoomAbout(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.2 : 1 / 1.2); clampView(); redraw(); }} />
      </div>
      {err && <div className="notice glass" role="alert">{err}</div>}

      <header className="hud top glass">
        <a href="/trips" className="back" aria-label="Back to your voyages">Trips</a>
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Trip title" maxLength={80} />
        <span className="save" aria-live="polite">{status}</span>
      </header>

      <div className="find glass">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a city or place to add" aria-label="Search places" />
        {results.length > 0 && (
          <ul className="results">
            {results.map((h, i) => (
              <li key={`${h.id ?? i}`}><button onClick={() => pick(h)}>{h.name}<small>{[h.admin1, h.country].filter(Boolean).join(", ")}</small></button></li>
            ))}
          </ul>
        )}
      </div>

      {stops.length === 0 && !q && <div className="hint glass">Tap the map to drop your first stop, or search a place above.</div>}

      <div className="zoom">
        <button aria-label="Zoom in" onClick={() => { zoomAbout(size.current.w / 2, size.current.h / 2, 1.7); clampView(); redraw(); }}>+</button>
        <button aria-label="Zoom out" onClick={() => { zoomAbout(size.current.w / 2, size.current.h / 2, 1 / 1.7); clampView(); redraw(); }}>−</button>
      </div>

      {caption && <div className="caption glass">{caption}</div>}

      {cur && sel !== null && !playing && (
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
            <button className="btn small" onClick={() => focus(sel, 14)}>Zoom here</button>
            <button className="link danger" onClick={() => remove(sel)}>Delete stop</button>
          </div>
        </aside>
      )}

      <footer className="reel glass">
        <div className="reel-head">
          <button className="btn small" onClick={film} disabled={!stops.length}>{playing ? "Stop film" : "Play trip film"}</button>
          <button className="btn small ghost" onClick={poster} disabled={!stops.length}>Share poster</button>
          <span>{stops.length} {stops.length === 1 ? "stop" : "stops"}, {km.toLocaleString()} km, {(km / 40075).toFixed(2)}× around the world</span>
        </div>
        <ol className="strip">
          {stops.map((s, i) => (
            <li key={s.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)} onDragEnd={() => setDrag(null)}
              className={`card ${sel === i ? "on" : ""} ${drag === i ? "lifting" : ""}`}>
              <button onClick={() => { setSel(i); focus(i, 6); }}><b>{i + 1}</b><span>{s.name}</span></button>
            </li>
          ))}
          {stops.length > 1 && <li className="tip">Drag cards to reorder the route</li>}
        </ol>
      </footer>
    </div>
  );
}
