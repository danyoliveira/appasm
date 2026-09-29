import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Refreshes the Supabase auth session for the current request, writing any
 * updated cookies onto the SAME response object passed in (important: must
 * be next-intl's response, not a freshly constructed one, so its locale
 * rewrite/header injection isn't lost).
 */
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims validates the session token locally (signing keys are
  // cached) instead of asking the Auth server on every single request like
  // getUser did — this runs before every page, so it was a round trip each
  // time. It still refreshes an expired session (cookies written above).
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? { id: data.claims.sub } : null;
}
