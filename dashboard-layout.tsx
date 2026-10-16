import Link from "next/link";
import { LogoutButton } from "@/components/Bits";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav">
        <Link href="/trips" className="brand">Wanderline</Link>
        <LogoutButton />
      </nav>
      {children}
    </>
  );
}
