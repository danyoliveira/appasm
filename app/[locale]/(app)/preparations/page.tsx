import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getTeamSeasonFixtures, getTeamInfo } from "@/lib/api-football/cache";
import { getCurrentCompetitions } from "@/lib/api-football/teamStats";
import { resolveManualOpponent } from "@/lib/manualOpponent";
import AddManualPreparation from "./AddManualPreparation";
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

  let ourLogo: string | null = null;
  if (teamId) {
    try {
      const teamInfo = await getTeamInfo(teamId);
      ourLogo = teamInfo[0]?.team.logo ?? null;
    } catch {
      // Bonus data — the crest-color highlight just falls back to neutral.
    }
  }

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
            isHome: fx.teams.home.id === teamId,
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

  // Manual games join the same past/future lists as real fixtures (split by
  // today's date, since they carry no score to tell finished from upcoming)
  // instead of living in their own separate section — PreparationFixtureList
  // flags them visually via `isManual`.
  if (teamId) {
    const { data: manualRows } = await supabase
      .from("manual_preparations")
      .select("id, opponent_team_id, opponent_name, opponent_logo, match_date")
      .eq("team_id", teamId)
      .order("match_date", { ascending: true });

    if (manualRows?.length) {
      const opponents = await Promise.all(manualRows.map(resolveManualOpponent));
      const now = new Date().getTime();
      const manualFixtureRows: PreparationFixtureRow[] = manualRows.map((row, i) => ({
        id: `manual-${row.id}`,
        date: row.match_date,
        opponentName: opponents[i].name,
        opponentLogo: opponents[i].logo,
        competitionName: null,
        competitionLogo: null,
        isHome: true,
        isPrepared: true,
        isManual: true,
      }));
      pastFixtureRows = [
        ...pastFixtureRows,
        ...manualFixtureRows.filter((r) => new Date(r.date).getTime() < now),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      futureFixtureRows = [
        ...futureFixtureRows,
        ...manualFixtureRows.filter((r) => new Date(r.date).getTime() >= now),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
        logoUrl={ourLogo}
        isCoach={isCoach}
        labels={{
          dateTime: t("columnDateTime"),
          opponent: t("columnOpponent"),
          competition: t("columnCompetition"),
          home: t("homeLabel"),
          away: t("awayLabel"),
          prepareAction: t("preparationStartButton"),
          resumeAction: t("preparationResumeButton"),
          confirmStart: t("preparationConfirmStart"),
          cancel: t("cancelButton"),
          showMorePast: t("showMorePastButton"),
          showMoreFuture: t("showMoreFutureButton"),
          noFixturesFound: t("noFixturesFoundInCalendar"),
          nextFixture: t("nextFixtureLabel"),
          manualBadge: t("preparationManualBadge"),
          deleteAction: t("deleteButton"),
          confirmDelete: t("confirmDeleteMessage"),
        }}
      />
    </div>
  );
}
