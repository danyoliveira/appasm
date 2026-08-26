import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamInfo } from "@/lib/api-football/cache";

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: stints } = await supabase
    .from("coaching_stints")
    .select("id, team_id, started_at, ended_at")
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false });

  const rows = stints ?? [];
  const teamInfos = await Promise.all(rows.map((s) => getTeamInfo(s.team_id).catch(() => [])));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("archiveTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("archiveSubtitle")}</p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted">{t("archiveEmptyState")}</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((stint, i) => {
            const team = teamInfos[i][0]?.team;
            return (
              <Link
                key={stint.id}
                href={`/archive/${stint.id}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent"
              >
                {team?.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logo} alt="" className="h-10 w-10 shrink-0 object-contain" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{team?.name ?? "—"}</div>
                  <div className="text-xs text-muted">
                    {new Date(stint.started_at).toLocaleDateString(locale)}
                    {" – "}
                    {new Date(stint.ended_at!).toLocaleDateString(locale)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
