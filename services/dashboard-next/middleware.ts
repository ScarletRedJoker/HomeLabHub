import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as jose from "jose";

const publicPaths = ["/login", "/api/auth/login", "/api/auth/dev-login", "/api/health", "/api/ai/status", "/api/ai/health-webhook", "/api/setup", "/setup", "/api/presence/current"];

function getSessionSecret(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("session");

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const secret = getSessionSecret();
  if (!secret) {
    console.error("SESSION_SECRET is not configured or is too short");
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    return response;
  }

  try {
    await jose.jwtVerify(sessionCookie.value, secret);
    return NextResponse.next();
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("session");
      return response;
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
