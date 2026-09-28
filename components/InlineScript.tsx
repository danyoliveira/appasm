"use client";

// A Client Component on purpose: rendered on the server it emits
// type="text/javascript", and when React renders it in the browser the
// `typeof window` check flips it to inert text/plain. As a Server Component
// the browser would only ever receive the server's type.
//
// An inline script that runs during HTML parsing (hard navigations) and is
// inert when React renders it on the client (soft navigations, e.g. a
// locale switch re-rendering the root layout) — React warns about, and never
// executes, <script> elements it renders client-side. Pattern from Next's
// "Preventing flash before hydration" guide.
export default function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
