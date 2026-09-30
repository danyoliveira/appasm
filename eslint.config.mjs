import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Leftover dev build caches from `next dev` (see next.config.ts /
    // generate-agent-files.js) — never committed, but lint would otherwise
    // crawl whatever they happen to contain.
    ".next-stale-*/**",
  ]),
]);

export default eslintConfig;
