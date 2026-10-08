import { authFromToken } from "@/lib/auth";
import { isPublicPath } from "@/lib/access";
import { NextResponse } from "next/server";

// Proxy cannot safely resolve Prisma-backed institutional overrides. It performs
// authentication redirects only; every protected server page/action/route must
// authorize again through the tenant-aware server DAL.
//
// The token alone cannot tell a suspended account from an active one, so the proxy
// never redirects away from /login: `src/app/login/layout.tsx` does that with the
// live session. Redirecting here would loop for a token that is no longer valid.
export default authFromToken((request) => {
  const { nextUrl } = request;
  const isLoggedIn = Boolean(request.auth?.user);
  const isPublicRoute = isPublicPath(nextUrl.pathname);

  if (!isLoggedIn && !isPublicRoute) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logos/|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)"],
};
