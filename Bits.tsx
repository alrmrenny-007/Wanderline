"use client";
import { useRouter } from "next/navigation";

export function NewTripButton() {
  const router = useRouter();
  return (
    <button className="btn" onClick={async () => {
      const t = await (await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();
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
