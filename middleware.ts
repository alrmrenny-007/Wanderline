import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Route groups (auth) and (dashboard) don't appear in URLs, so we gate by path.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get("wl_session")?.value;
  let ok = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me"));
      ok = true;
    } catch {}
  }
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login";
  if (!ok && !isAuthPage) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (ok && isAuthPage) return NextResponse.redirect(new URL("/trips", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/trips/:path*", "/login", "/api/trips/:path*", "/api/trips", "/api/upload"] };
