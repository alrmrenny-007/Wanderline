import { NextResponse } from "next/server";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getUser, saveUser } from "@/lib/store";
import { createSession, destroySession } from "@/lib/session";

const hashPw = (pw: string, salt: string) => scryptSync(pw, salt, 64).toString("hex");

export async function POST(req: Request) {
  const { email, password, mode } = await req.json();
  const e = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e) || String(password || "").length < 8)
    return NextResponse.json({ error: "Use a valid email and a password of 8+ characters." }, { status: 400 });
  const id = createHash("sha256").update(e).digest("hex").slice(0, 16);
  const existing = await getUser(id);

  if (mode === "register") {
    if (existing) return NextResponse.json({ error: "That email already has an account. Sign in instead." }, { status: 409 });
    const salt = randomBytes(16).toString("hex");
    await saveUser({ id, email: e, salt, hash: hashPw(password, salt) });
  } else {
    const ok = existing && timingSafeEqual(Buffer.from(existing.hash), Buffer.from(hashPw(password, existing.salt)));
    if (!ok) return NextResponse.json({ error: "Email or password is wrong." }, { status: 401 });
  }
  await createSession(id);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
