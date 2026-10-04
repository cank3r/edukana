import { auth } from "@/lib/auth";
import { isPublicPath } from "@/lib/access";
import { NextResponse } from "next/server";

// Proxy cannot safely resolve Prisma-backed institutional overrides. It performs
// authentication redirects only; every protected server page/action/route must
// authorize again through the tenant-aware server DAL.
export default auth((request) => {
  const { nextUrl } = request;
  const isLoggedIn = Boolean(request.auth?.user);
  const isPublicRoute = isPublicPath(nextUrl.pathname);

  if (nextUrl.pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

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
