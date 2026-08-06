import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { refreshSession } from "./lib/supabase/middleware";
import { coachExists } from "./lib/invites";

const intlMiddleware = createMiddleware(routing);

const PROTECTED_SEGMENTS = ["dashboard"];
const AUTH_ONLY_SEGMENTS = ["login", "register"];

export async function proxy(request: NextRequest) {
  // 1. Let next-intl resolve locale routing first.
  const intlResponse = intlMiddleware(request);

  // 2. If it's issuing a redirect (adding/normalizing the locale prefix),
  //    return immediately — auth is re-checked on the follow-up request
  //    once the URL is in its final, locale-prefixed shape.
  if (intlResponse.headers.get("location")) {
    return intlResponse;
  }

  // 3. Refresh the Supabase session, writing cookies onto the SAME
  //    response next-intl produced (not a new one).
  const user = await refreshSession(request, intlResponse);

  // 4. Resolve locale + the path with the locale prefix stripped.
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const hasLocale = (routing.locales as readonly string[]).includes(
    segments[0],
  );
  const locale = hasLocale ? segments[0] : routing.defaultLocale;
  const firstSegment = hasLocale ? segments[1] : segments[0];

  if (!user && PROTECTED_SEGMENTS.includes(firstSegment)) {
    const url = new URL(`/${locale}/login`, request.url);
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    const redirectResponse = NextResponse.redirect(url);
    intlResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  if (user && AUTH_ONLY_SEGMENTS.includes(firstSegment)) {
    const redirectResponse = NextResponse.redirect(
      new URL(`/${locale}/dashboard`, request.url),
    );
    intlResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  if (!user && (firstSegment === "login" || !firstSegment) && !(await coachExists())) {
    // No coach account yet — there's nothing to log into. Send whoever
    // lands here straight to the one-time "create the coach account" form
    // instead of a login screen no one has credentials for yet.
    const redirectResponse = NextResponse.redirect(
      new URL(`/${locale}/register`, request.url),
    );
    intlResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  if (!firstSegment) {
    // Root of a locale ("/pt", "/en", ...) — no landing page, go straight
    // to the dashboard if signed in, otherwise to login.
    const destination = user ? "dashboard" : "login";
    const redirectResponse = NextResponse.redirect(
      new URL(`/${locale}/${destination}`, request.url),
    );
    intlResponse.cookies.getAll().forEach((c) => redirectResponse.cookies.set(c));
    return redirectResponse;
  }

  return intlResponse;
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
