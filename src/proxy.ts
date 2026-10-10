import { authFromToken } from "@/lib/auth";
import { isPublicPath } from "@/lib/access";
import { resolveInstitutionHost } from "@/server/platform/domains";
import { institutionMatchesHost, sanitizeHostHeaders, requestOrigin } from "@/server/platform/domain-policy";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";

// Proxy performs navigation redirects only. Protected pages/actions/APIs must
// authorize again via auth(), which checks live membership and actual host.
const navigate = authFromToken(async (request, _event: NextFetchEvent) => {
  void _event; // Explicit event type selects Auth.js middleware overload rather than its route overload.
  const { nextUrl } = request;
  const requestHeaders = sanitizeHostHeaders(request.headers, nextUrl.protocol);
  // APIs still receive sanitized headers, but retain their own status/auth semantics.
  if (nextUrl.pathname.startsWith("/api/")) return NextResponse.next({ request: { headers: requestHeaders } });
  const institution = await resolveInstitutionHost(request.headers.get("host"));
  const isLoggedIn = Boolean(request.auth?.user &&
    institutionMatchesHost(request.auth.user.institutionId, institution));
  if (!isLoggedIn && !isPublicPath(nextUrl.pathname)) {
    const origin = requestOrigin(request.headers.get("host"), nextUrl.protocol);
    if (!origin) return new NextResponse("Invalid request host", { status: 400 });
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }
  // Never redirect away from /login on a token alone: a suspended live session
  // would otherwise loop. The login layout and home page use the live guard.
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const origin = requestOrigin(request.headers.get("host"), request.nextUrl.protocol);
  if (!origin) return new NextResponse("Invalid request host", { status: 400 });
  const url = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, origin);
  const clean = new NextRequest(new NextRequest(url, request), {
    headers: sanitizeHostHeaders(request.headers, request.nextUrl.protocol),
  });
  return navigate(clean, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)"],
};
