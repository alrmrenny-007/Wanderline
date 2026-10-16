"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr("");
    const f = new FormData(e.currentTarget);
    const r = await fetch("/api/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: f.get("email"), password: f.get("password"), mode })
    });
    if (r.ok) { router.push("/trips"); router.refresh(); return; }
    setErr((await r.json()).error || "Something went wrong."); setBusy(false);
  }

  return (
    <main className="gate">
      <svg className="gate-arc" viewBox="0 0 400 200" aria-hidden="true">
        <path d="M10 180 Q 200 -60 390 160" fill="none" stroke="var(--sodium)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />
        <circle cx="10" cy="180" r="6" fill="var(--sodium)" /><circle cx="390" cy="160" r="6" fill="var(--sodium)" />
      </svg>
      <h1>Wanderline</h1>
      <p className="lede">Plot a trip as a flight path across a 3D globe, then press play and watch it fly.</p>
      <form onSubmit={submit} className="glass form">
        <input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input name="password" type="password" placeholder="Password (8+ characters)" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? "One moment" : mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
