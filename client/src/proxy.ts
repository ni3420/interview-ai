import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  "/interview(.*)",
])

const withClerk = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const { userId, redirectToSignIn } = await auth()
    if (!userId) return redirectToSignIn()
  }
})

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // The Playwright harness is a test-only surface: never route it through
  // Clerk, and answer with a real 404 unless the harness is explicitly enabled.
  if (request.nextUrl.pathname.startsWith('/e2e/')) {
    return process.env.E2E_HARNESS === '1'
      ? NextResponse.next()
      : new NextResponse(null, { status: 404 })
  }
  return withClerk(request, event)
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
