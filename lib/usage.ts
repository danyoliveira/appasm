import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiFootballError, fetchApiStatus, type ApiFootballReason } from "@/lib/api-football/client";

// The external data source's own account status — asking for it doesn't
// count towards the daily request quota.
export interface ExternalApiUsage {
  plan: string | null;
  active: boolean;
  // ISO date the subscription runs until.
  endsAt: string | null;
  requestsToday: number;
  dailyLimit: number;
}

export interface PlatformUsage {
  databaseBytes: number;
  tables: { name: string; bytes: number; rows: number }[];
  storage: { bucket: string; files: number; bytes: number }[];
}

export interface UsageReport {
  external: ExternalApiUsage | null;
  externalError: ApiFootballReason | null;
  // null when the usage function isn't installed yet (migration 0054).
  platform: PlatformUsage | null;
  // Responses kept in the app's own cache (fewer requests to the source).
  cachedResponses: number | null;
}

export async function loadUsageReport(supabase: SupabaseClient): Promise<UsageReport> {
  const [status, platform, cache] = await Promise.all([
    fetchApiStatus().then(
      (value) => ({ value, error: null as ApiFootballReason | null }),
      (err) => ({ value: null, error: err instanceof ApiFootballError ? err.reason : ("unknown" as const) }),
    ),
    supabase.rpc("platform_usage"),
    supabase.from("api_football_cache").select("cache_key", { count: "exact", head: true }),
  ]);

  const raw = platform.error ? null : (platform.data as Record<string, unknown> | null);
  const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]) : []);

  return {
    external: status.value
      ? {
          plan: status.value.subscription?.plan ?? null,
          active: Boolean(status.value.subscription?.active),
          endsAt: status.value.subscription?.end ?? null,
          requestsToday: Number(status.value.requests?.current ?? 0),
          dailyLimit: Number(status.value.requests?.limit_day ?? 0),
        }
      : null,
    externalError: status.error,
    platform: raw
      ? {
          databaseBytes: Number(raw.database_bytes ?? 0),
          tables: list(raw.tables).map((t) => ({
            name: String(t.name),
            bytes: Number(t.bytes ?? 0),
            rows: Number(t.rows ?? 0),
          })),
          storage: list(raw.storage).map((b) => ({
            bucket: String(b.bucket),
            files: Number(b.files ?? 0),
            bytes: Number(b.bytes ?? 0),
          })),
        }
      : null,
    cachedResponses: cache.error ? null : (cache.count ?? 0),
  };
}

// "12,4 MB" in the app's language.
export function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${units[unit]}`;
}
