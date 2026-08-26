import type { TeamStatistics } from "@/lib/api-football/client";

export default function SeasonStatsGrid({
  t,
  stats,
}: {
  t: (key: string) => string;
  stats: TeamStatistics;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="text-xs text-muted">{t("statPlayed")}</div>
        <div className="mt-1 text-xl font-semibold">{stats.fixtures.played.total}</div>
      </div>
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="text-xs text-muted">{t("statRecord")}</div>
        <div className="mt-1 text-xl font-semibold">
          {stats.fixtures.wins.total}-{stats.fixtures.draws.total}-{stats.fixtures.loses.total}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="text-xs text-muted">{t("statGoals")}</div>
        <div className="mt-1 text-xl font-semibold">
          {stats.goals.for.total.total}:{stats.goals.against.total.total}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="text-xs text-muted">{t("statCleanSheets")}</div>
        <div className="mt-1 text-xl font-semibold">{stats.clean_sheet.total}</div>
      </div>
    </div>
  );
}
