import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const COOKIE = "wl_session";
export const secretKey = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function createSession(uid: string) {
  const token = await new SignJWT({ uid }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("14d").sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14,
    secure: process.env.NODE_ENV === "production"
  });
}

export async function destroySession() { (await cookies()).delete(COOKIE); }

export async function getUid(): Promise<string | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try { return (await jwtVerify(t, secretKey())).payload.uid as string; } catch { return null; }
}
