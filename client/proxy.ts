import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

const isAuthRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const isAuthenticated = !!userId;

  const { pathname, search } = req.nextUrl;

  // Redirect authenticated users away from landing and auth pages.
  if (
    isAuthenticated &&
    (pathname === "/" || isAuthRoute(req))
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Redirect unauthenticated users from private pages.
  if (!isPublicRoute(req) && !isAuthenticated) {
    const signInUrl = new URL("/sign-in", req.url);

    // Preserve the destination after sign-in.
    signInUrl.searchParams.set(
      "redirect_url",
      `${pathname}${search}`
    );

    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};