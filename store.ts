import { put, list, del } from "@vercel/blob";
import type { Trip } from "./types";

// Vercel Blob in production; in-memory map locally when no token is set.
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
export const persistent = useBlob;
const mem: Map<string, string> = ((globalThis as any).__wl ??= new Map());
const fresh = (url: string) => fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });

async function write(path: string, data: unknown) {
  const body = JSON.stringify(data);
  if (!useBlob) { mem.set(path, body); return; }
  await put(path, body, { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
}

async function read<T>(path: string): Promise<T | null> {
  if (!useBlob) { const v = mem.get(path); return v ? JSON.parse(v) : null; }
  const { blobs } = await list({ prefix: path, limit: 1 });
  const b = blobs.find((x) => x.pathname === path);
  if (!b) return null;
  const r = await fresh(b.url);
  return r.ok ? r.json() : null;
}

async function readAll<T>(prefix: string): Promise<T[]> {
  if (!useBlob) return [...mem.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => JSON.parse(v));
  const { blobs } = await list({ prefix });
  return Promise.all(blobs.map((b) => fresh(b.url).then((r) => r.json())));
}

async function remove(path: string) {
  if (!useBlob) { mem.delete(path); return; }
  const { blobs } = await list({ prefix: path, limit: 1 });
  const b = blobs.find((x) => x.pathname === path);
  if (b) await del(b.url);
}

export const safeId = (id: string) => /^[a-z0-9]{6,32}$/i.test(id);

export const getUser = (uid: string) => read<{ id: string; email: string; salt: string; hash: string }>(`users/${uid}.json`);
export const saveUser = (u: { id: string; email: string; salt: string; hash: string }) => write(`users/${u.id}.json`, u);

export const getTrip = (uid: string, id: string) => (safeId(id) ? read<Trip>(`trips/${uid}/${id}.json`) : Promise.resolve(null));
export const saveTrip = (t: Trip) => write(`trips/${t.owner}/${t.id}.json`, t);
export const deleteTrip = (uid: string, id: string) => remove(`trips/${uid}/${id}.json`);
export async function listTrips(uid: string) {
  const all = await readAll<Trip>(`trips/${uid}/`);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

// Used by /api/health to check that storage really persists on this deployment.
export async function selfTest() {
  const out = { blobToken: useBlob, write: false, read: false, error: "" };
  try {
    const p = `health/${Date.now()}.json`;
    await write(p, { ok: 1 });
    out.write = true;
    out.read = !!(await read(p));
    await remove(p);
  } catch (e: any) {
    out.error = String(e?.message || e).slice(0, 200);
  }
  return out;
}
