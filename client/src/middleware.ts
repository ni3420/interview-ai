import { authMiddleware } from "@clerk/nextjs/server";

export default authMiddleware({
  publicRoutes: [
    "/",
    "/sign-in(.*)",
    "/sign-up(.*)",
    "/api/webhooks/clerk",
  ],
  ignoredRoutes: [
    "/api/webhooks/clerk",
    "/_next(.*)",
    "/static(.*)",
    "/favicon.ico",
  ],
});

export const config = {
  matcher: [
    "/((?!_next|static|favicon.ico|api/webhooks).*)",
    "/(api|trpc)(.*)",
  ],
};