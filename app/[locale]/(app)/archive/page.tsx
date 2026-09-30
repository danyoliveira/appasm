import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamInfo } from "@/lib/api-football/cache";
import TeamCrest from "@/components/TeamCrest";
import DeleteStintButton from "./DeleteStintButton";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isCoach = profile?.role === "coach";

  const { data: stints } = await supabase
    .from("coaching_stints")
    .select("id, team_id, started_at, ended_at")
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false });

  const rows = stints ?? [];
  const teamIds = Array.from(new Set(rows.map((s) => s.team_id)));
  const stintIds = rows.map((s) => s.id);

  // What each spell left behind: the frozen squad and the preparations
  // started during it (both kinds), so a card says whether there's anything
  // worth opening.
  const [teamInfos, { data: squadRows }, { data: fixturePreps }, { data: manualPreps }, { data: dossierRows }] = await Promise.all([
    Promise.all(teamIds.map((id) => getTeamInfo(id).catch(() => []))),
    stintIds.length > 0
      ? supabase.from("archived_squad_players").select("stint_id").in("stint_id", stintIds)
      : Promise.resolve({ data: [] as { stint_id: string }[] }),
    teamIds.length > 0
      ? supabase.from("fixture_preparations").select("team_id, created_at").in("team_id", teamIds)
      : Promise.resolve({ data: [] as { team_id: number; created_at: string }[] }),
    teamIds.length > 0
      ? supabase.from("manual_preparations").select("team_id, created_at").in("team_id", teamIds)
      : Promise.resolve({ data: [] as { team_id: number; created_at: string }[] }),
    stintIds.length > 0
      ? supabase.from("team_dossier_files").select("stint_id").in("stint_id", stintIds)
      : Promise.resolve({ data: [] as { stint_id: string }[] }),
  ]);

  const teamById = new Map(teamIds.map((id, i) => [id, teamInfos[i][0]?.team ?? null]));
  const squadCount = new Map<string, number>();
  for (const row of squadRows ?? []) squadCount.set(row.stint_id, (squadCount.get(row.stint_id) ?? 0) + 1);
  const dossierCount = new Map<string, number>();
  for (const row of dossierRows ?? []) dossierCount.set(row.stint_id, (dossierCount.get(row.stint_id) ?? 0) + 1);
  const preparations = [...(fixturePreps ?? []), ...(manualPreps ?? [])];
  const preparationCount = (stint: (typeof rows)[number]) =>
    preparations.filter(
      (p) => p.team_id === stint.team_id && p.created_at >= stint.started_at && p.created_at <= stint.ended_at!,
    ).length;

  // One card per club (most recent spell first) — the same club coached
  // twice used to show up as two unrelated cards.
  const clubs = teamIds.map((teamId) => ({
    teamId,
    team: teamById.get(teamId) ?? null,
    stints: rows.filter((s) => s.team_id === teamId),
  }));

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("archiveTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("archiveSubtitle")}</p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
          {t("archiveEmptyState")}
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
          {clubs.map((club) => (
            <section
              key={club.teamId}
              className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                <TeamCrest logo={club.team?.logo} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold">{club.team?.name ?? "—"}</h2>
                  <p className="text-xs text-muted">{t("archiveStintsCount", { count: club.stints.length })}</p>
                </div>
              </div>
              <div className="divide-y divide-border border-t border-border">
                {club.stints.map((stint) => {
                  const days = Math.floor(
                    (new Date(stint.ended_at!).getTime() - new Date(stint.started_at).getTime()) / DAY_MS,
                  );
                  const preps = preparationCount(stint);
                  const documents = dossierCount.get(stint.id) ?? 0;
                  const period =
                    formatDate(stint.started_at) === formatDate(stint.ended_at!)
                      ? formatDate(stint.started_at)
                      : `${formatDate(stint.started_at)} – ${formatDate(stint.ended_at!)}`;
                  return (
                    <div key={stint.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-background">
                      <Link href={`/archive/${stint.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{period}</div>
                          <div className="text-xs text-muted">
                            {t("archiveStintDays", { count: days })} ·{" "}
                            {t("archiveStintPlayers", { count: squadCount.get(stint.id) ?? 0 })} ·{" "}
                            <span className={preps > 0 ? "font-medium text-accent" : ""}>
                              {t("archiveStintPreparations", { count: preps })}
                            </span>
                            {documents > 0 && (
                              <>
                                {" "}
                                ·{" "}
                                <span className="font-medium text-accent">
                                  {t("archiveStintDocuments", { count: documents })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <span aria-hidden className="shrink-0 text-muted">
                          →
                        </span>
                      </Link>
                      {isCoach && (
                        <DeleteStintButton
                          stintId={stint.id}
                          clubName={club.team?.name ?? ""}
                          period={period}
                          preparations={preps}
                          variant="icon"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
