import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBytes, loadUsageReport } from "@/lib/usage";
import { SectionHeading } from "../OpponentScouting";
import ResetDatabaseSection from "./ResetDatabaseSection";

// Reference ceilings of Supabase's free plan — shown as a yardstick next to
// the real numbers (a paid plan has higher ones).
const FREE_PLAN_DATABASE_BYTES = 500 * 1024 * 1024;
const FREE_PLAN_STORAGE_BYTES = 1024 * 1024 * 1024;

function Meter({ value, max, label, detail }: { value: number; max: number; label: string; detail: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-600";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xl font-bold tabular-nums">{label}</span>
        <span className="text-xs text-muted">{detail}</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(pct, value > 0 ? 1.5 : 0)}%` }} />
      </div>
    </div>
  );
}

// Perfil → Utilização: today's requests to the external data source and how
// much of the database and file storage is in use.
export default async function UsageSection({ supabase, locale }: { supabase: SupabaseClient; locale: string }) {
  const t = await getTranslations("dashboard");
  const usage = await loadUsageReport(supabase);
  const number = (n: number) => n.toLocaleString(locale);
  const pctOf = (value: number, max: number) => (max > 0 ? Math.round((value / max) * 100) : 0);

  const { external, platform } = usage;
  const storageBytes = platform?.storage.reduce((sum, b) => sum + b.bytes, 0) ?? 0;
  const storageFiles = platform?.storage.reduce((sum, b) => sum + b.files, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <SectionHeading icon="grid" title={t("usageExternalTitle")} />
        <p className="mt-2 text-sm text-muted">{t("usageExternalHint")}</p>

        {external ? (
          <div className="mt-5">
            <Meter
              value={external.requestsToday}
              max={external.dailyLimit}
              label={`${number(external.requestsToday)} / ${number(external.dailyLimit)}`}
              detail={t("usageRequestsToday", { pct: pctOf(external.requestsToday, external.dailyLimit) })}
            />
            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("usagePlanLabel")}</dt>
                <dd className="mt-0.5 flex items-center gap-2 text-sm font-semibold">
                  {external.plan ?? "—"}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      external.active
                        ? "bg-green-600/10 text-green-700 dark:text-green-400"
                        : "bg-red-500/10 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {external.active ? t("usagePlanActive") : t("usagePlanInactive")}
                  </span>
                </dd>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("usageRemainingLabel")}</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                  {number(Math.max(0, external.dailyLimit - external.requestsToday))}
                </dd>
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("usageRenewsLabel")}</dt>
                <dd className="mt-0.5 text-sm font-semibold">
                  {external.endsAt
                    ? new Date(external.endsAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              {t("usageResetHint")}
              {usage.cachedResponses != null && ` ${t("usageCacheHint", { count: usage.cachedResponses })}`}
            </p>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            {usage.externalError === "rate-limit"
              ? t("clubsErrorRateLimit")
              : usage.externalError === "not-subscribed"
                ? t("clubsErrorNotSubscribed")
                : t("usageExternalUnavailable")}
          </p>
        )}
      </section>

      {platform ? (
        <>
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <SectionHeading icon="list" title={t("usageDatabaseTitle")} />
            <div className="mt-5">
              <Meter
                value={platform.databaseBytes}
                max={FREE_PLAN_DATABASE_BYTES}
                label={formatBytes(platform.databaseBytes, locale)}
                detail={t("usageOfReference", {
                  pct: pctOf(platform.databaseBytes, FREE_PLAN_DATABASE_BYTES),
                  limit: formatBytes(FREE_PLAN_DATABASE_BYTES, locale),
                })}
              />
            </div>

            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">{t("usageLargestTables")}</h3>
            <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-background">
              {platform.tables.slice(0, 8).map((table) => (
                <div key={table.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{table.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {t("usageRows", { count: table.rows })}
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatBytes(table.bytes, locale)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t("usageTablesCount", { count: platform.tables.length })}</p>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <SectionHeading icon="file" title={t("usageStorageTitle")} />
            <div className="mt-5">
              <Meter
                value={storageBytes}
                max={FREE_PLAN_STORAGE_BYTES}
                label={formatBytes(storageBytes, locale)}
                detail={t("usageOfReference", {
                  pct: pctOf(storageBytes, FREE_PLAN_STORAGE_BYTES),
                  limit: formatBytes(FREE_PLAN_STORAGE_BYTES, locale),
                })}
              />
            </div>
            {platform.storage.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t("usageNoFiles")}</p>
            ) : (
              <div className="mt-5 divide-y divide-border rounded-xl border border-border bg-background">
                {platform.storage.map((bucket) => (
                  <div key={bucket.bucket} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{bucket.bucket}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {t("usageFiles", { count: bucket.files })}
                    </span>
                    <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatBytes(bucket.bytes, locale)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              {t("usageFilesTotal", { count: storageFiles })} {t("usageReferenceNote")}
            </p>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-muted sm:p-6">
          <p className="font-medium text-foreground">{t("usagePlatformUnavailableTitle")}</p>
          <p className="mt-1">{t("usagePlatformUnavailableHint")}</p>
        </section>
      )}

      <ResetDatabaseSection />
    </div>
  );
}
