import { auth } from "@/lib/auth";
import { canAccessDashboardPath, isPublicPath } from "@/lib/access";
import { NextResponse } from "next/server";

export default auth((request) => {
  const { nextUrl } = request;
  const user = request.auth?.user;
  const isLoggedIn = Boolean(user);
  const isPublicRoute = isPublicPath(nextUrl.pathname);

  if (nextUrl.pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  if (!isLoggedIn && !isPublicRoute) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", `${nextUrl.pathname}${nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (
    user?.role &&
    nextUrl.pathname.startsWith("/dashboard") &&
    !canAccessDashboardPath(nextUrl.pathname, user.role)
  ) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logos/|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)"],
};
