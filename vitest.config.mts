import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      // `server-only` throws unconditionally when resolved via its plain
      // `main` entry (see node_modules/server-only/index.js) — Next.js only
      // avoids that by resolving the package's `react-server` export
      // condition to the no-op `empty.js` instead. Vitest doesn't set that
      // condition, so alias the import straight to the same no-op file.
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
