import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ACCESS = process.env.AUTH_ACCESS_COOKIE!;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static assets from /public (any file with an extension)
  // and Next.js internal assets
  if (pathname.startsWith("/_next") || /\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Público
  if (pathname === "/" || pathname.startsWith("/login")) return NextResponse.next();

  // Protegidas (simple: presencia de cookie)
  if (!req.cookies.get(ACCESS)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|assets|favicon.ico|.*\\..*).*)"],
};
