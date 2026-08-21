import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getTeamSeasonFixtures, getTeamInfo } from "@/lib/api-football/cache";
import { getCurrentCompetitions } from "@/lib/api-football/teamStats";
import AddManualPreparation from "./AddManualPreparation";
import ManualPreparationsList, { type ManualPreparationRow } from "./ManualPreparationsList";
import PreparationFixtureList, {
  type PreparationFixtureRow,
} from "./PreparationFixtureList";

export default async function PreparationListPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isCoach = profile?.role === "coach";

  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("role", "coach")
    .maybeSingle();

  const teamId = coachProfile?.api_football_team_id ?? null;

  let pastFixtureRows: PreparationFixtureRow[] = [];
  let futureFixtureRows: PreparationFixtureRow[] = [];
  if (teamId) {
    try {
      const current = await getCurrentCompetitions(teamId);
      if (current.defaultSeason) {
        const [seasonFixtures, preparedRows] = await Promise.all([
          getTeamSeasonFixtures(teamId, current.defaultSeason).catch(() => []),
          supabase
            .from("fixture_preparations")
            .select("fixture_id")
            .eq("team_id", teamId)
            .then(({ data }) => data ?? []),
        ]);
        const preparedFixtureIds = new Set(preparedRows.map((row) => row.fixture_id));

        const toRow = (fx: (typeof seasonFixtures)[number]): PreparationFixtureRow => {
          const opponent = fx.teams.home.id === teamId ? fx.teams.away : fx.teams.home;
          return {
            id: fx.fixture.id,
            date: fx.fixture.date,
            opponentName: opponent.name,
            opponentLogo: opponent.logo,
            competitionName: fx.league.name,
            competitionLogo: fx.league.logo,
            isPrepared: preparedFixtureIds.has(fx.fixture.id),
          };
        };
        // Past games only show up once actually prepared (i.e. someone
        // opened its preparation page) — otherwise the list would be
        // cluttered with the team's entire match history.
        pastFixtureRows = seasonFixtures
          .filter(
            (fx) =>
              fx.goals.home != null &&
              fx.goals.away != null &&
              preparedFixtureIds.has(fx.fixture.id),
          )
          .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime())
          .map(toRow);
        futureFixtureRows = seasonFixtures
          .filter((fx) => fx.goals.home == null || fx.goals.away == null)
          .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime())
          .map(toRow);
      }
    } catch {
      // Bonus data — silently skip if unavailable.
    }
  }

  let manualPreparationRows: ManualPreparationRow[] = [];
  if (teamId) {
    const { data: manualRows } = await supabase
      .from("manual_preparations")
      .select("id, opponent_team_id, match_date")
      .eq("team_id", teamId)
      .order("match_date", { ascending: true });

    if (manualRows?.length) {
      const opponentInfos = await Promise.all(
        manualRows.map((row) => getTeamInfo(row.opponent_team_id).catch(() => [])),
      );
      manualPreparationRows = manualRows.map((row, i) => ({
        id: row.id,
        matchDate: row.match_date,
        opponentName: opponentInfos[i][0]?.team.name ?? "?",
        opponentLogo: opponentInfos[i][0]?.team.logo ?? "",
      }));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("navPreparation")}</h1>
      <p className="mt-2 text-sm text-muted">{t("preparationPickFixtureSubtitle")}</p>

      {isCoach && <AddManualPreparation />}

      <PreparationFixtureList
        past={pastFixtureRows}
        future={futureFixtureRows}
        locale={locale}
        labels={{
          dateTime: t("columnDateTime"),
          opponent: t("columnOpponent"),
          competition: t("columnCompetition"),
          prepareAction: t("preparationStartButton"),
          resumeAction: t("preparationResumeButton"),
          confirmStart: t("preparationConfirmStart"),
          cancel: t("cancelButton"),
          showMorePast: t("showMorePastButton"),
          showMoreFuture: t("showMoreFutureButton"),
          noFixturesFound: t("noFixturesFoundInCalendar"),
        }}
      />

      <ManualPreparationsList rows={manualPreparationRows} locale={locale} isCoach={isCoach} />
    </div>
  );
}
