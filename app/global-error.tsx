"use client";

import { useEffect } from "react";

// The one error.tsx that can catch a failure in app/[locale]/layout.tsx
// itself (the <html>/<body> root layout) — every other error.tsx is
// rendered inside that layout, so none of them can catch its own failure.
// Next.js requires this file to supply its own <html>/<body>, and
// recommends inline styles here specifically: this renders in place of the
// root layout, so it can't rely on next-intl's provider (no context to read
// from) or assume globals.css definitely loaded for this response.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#fafaf9",
          color: "#16181d",
        }}
      >
        <div style={{ textAlign: "center", padding: "1.5rem" }}>
          <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 500 }}>
            Ocorreu um erro inesperado.
          </p>
          <p style={{ marginTop: "0.25rem", marginBottom: 0, fontSize: "0.875rem", color: "#6b7280" }}>
            Tenta recarregar a página.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1rem",
              borderRadius: "9999px",
              border: "none",
              background: "#1c3a5e",
              color: "#ffffff",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
