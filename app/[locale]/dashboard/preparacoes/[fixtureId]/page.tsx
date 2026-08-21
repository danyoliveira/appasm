import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getFixtureById,
  getTeamInfo,
  getLastFixtures,
  getNextFixtures,
  getInjuries,
  getHeadToHead,
  getSquad,
} from "@/lib/api-football/cache";
import {
  getCurrentCompetitions,
  getStatsPerCompetition,
  combineTeamStats,
} from "@/lib/api-football/teamStats";
import type { Fixture, TeamStatistics, Injury } from "@/lib/api-football/client";
import PreparationTabs from "../PreparationTabs";
import Countdown from "../../Countdown";
import { matchResult } from "../../clube/fixtureHelpers";
import { isNonInjuryReason, translateInjuryType } from "../../clube/playerShared";
import { getVideoEmbedUrl } from "@/lib/videoEmbed";
import AddPreparationVideo from "../AddPreparationVideo";
import PreparationVideoList, { type PreparationVideoRow } from "../PreparationVideoList";
import TacticalBoard from "../TacticalBoard";
import TacticalSnapshotList, { type TacticalSnapshotRow } from "../TacticalSnapshotList";
import type { TacticalArrow, TacticalMarker, TacticalPosition } from "../../actions";

interface PreparationMatch {
  opponentId: number;
  opponentName: string;
  opponentLogo: string;
  date: string;
  realFixtureId: number | null;
}

export default async function PreparationDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; fixtureId: string }>;
}) {
  const { locale, fixtureId: fixtureIdParam } = await params;
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

  let match: PreparationMatch | null = null;

  if (fixtureIdParam.startsWith("manual-")) {
    const manualId = fixtureIdParam.slice("manual-".length);
    const { data: manualRow } = await supabase
      .from("manual_preparations")
      .select("opponent_team_id, match_date")
      .eq("id", manualId)
      .maybeSingle();

    if (manualRow) {
      const opponentInfo = await getTeamInfo(manualRow.opponent_team_id).catch(() => []);
      if (opponentInfo[0]) {
        match = {
          opponentId: manualRow.opponent_team_id,
          opponentName: opponentInfo[0].team.name,
          opponentLogo: opponentInfo[0].team.logo,
          date: manualRow.match_date,
          realFixtureId: null,
        };
      }
    }
  } else {
    const fixtureId = Number(fixtureIdParam);
    const fixtureResult = await getFixtureById(fixtureId).catch(() => []);
    const fixture = fixtureResult[0] ?? null;
    const opponent =
      fixture && teamId
        ? fixture.teams.home.id === teamId
          ? fixture.teams.away
          : fixture.teams.home
        : null;

    if (fixture && opponent) {
      match = {
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentLogo: opponent.logo,
        date: fixture.fixture.date,
        realFixtureId: fixtureId,
      };

      // Opening this page is what "preparing" a fixture means — record it
      // (idempotent) so the past-games list below only shows fixtures that
      // were actually prepared, not the team's entire history.
      if (isCoach && teamId) {
        await supabase
          .from("fixture_preparations")
          .upsert(
            { team_id: teamId, fixture_id: fixtureId, created_by: user.id },
            { onConflict: "team_id,fixture_id", ignoreDuplicates: true },
          );
      }
    }
  }

  // Opponent scouting profile for the Pré-Jogo tab — the same data and
  // layout already proven on the dashboard's "next fixture" opponent panel
  // (injuries, unavailable players, head-to-head, last/next match either
  // side of this one, season stats as a compact list), reused here
  // per-match instead of duplicating a new design.
  let opponentStats: TeamStatistics | null = null;
  let opponentLastFixture: Fixture | null = null;
  let opponentNextFixture: Fixture | null = null;
  let opponentInjuries: Injury[] = [];
  let opponentUnavailable: Injury[] = [];
  let headToHead: Fixture[] = [];

  if (match) {
    try {
      const opponentCompetitions = await getCurrentCompetitions(match.opponentId);
      if (opponentCompetitions.defaultSeason) {
        const [statsByCompetitionId, lastFixtures, nextFixtures, injuriesResult, headToHeadResult] =
          await Promise.all([
            getStatsPerCompetition(
              match.opponentId,
              opponentCompetitions.competitions,
              opponentCompetitions.defaultSeason,
            ),
            getLastFixtures(match.opponentId).catch(() => []),
            getNextFixtures(match.opponentId).catch(() => []),
            getInjuries(match.opponentId, opponentCompetitions.defaultSeason).catch(() => []),
            teamId ? getHeadToHead(teamId, match.opponentId).catch(() => []) : Promise.resolve([]),
          ]);
        opponentStats = combineTeamStats(Array.from(statsByCompetitionId.values()));
        opponentLastFixture = lastFixtures[0] ?? null;
        opponentNextFixture =
          nextFixtures.find(
            (fx) =>
              fx.fixture.id !== match!.realFixtureId &&
              new Date(fx.fixture.date).getTime() > new Date(match!.date).getTime(),
          ) ?? null;
        headToHead = headToHeadResult;

        // /injuries returns one row per fixture a player missed, so the
        // same player shows up once per matchweek — keep only their most
        // recent entry so each injured player appears a single time.
        const latestInjuryByPlayer = new Map<number, Injury>();
        injuriesResult.forEach((injury) => {
          const existing = latestInjuryByPlayer.get(injury.player.id);
          if (!existing || new Date(injury.fixture.date) > new Date(existing.fixture.date)) {
            latestInjuryByPlayer.set(injury.player.id, injury);
          }
        });
        const dedupedInjuries = Array.from(latestInjuryByPlayer.values());
        // Suspensions, national duty, coach's decision, etc. aren't a
        // medical injury — split them into their own "unavailable" list.
        opponentInjuries = dedupedInjuries.filter((i) => !isNonInjuryReason(i.player.reason));
        opponentUnavailable = dedupedInjuries.filter((i) => isNonInjuryReason(i.player.reason));
      }
    } catch {
      // Bonus data — silently skip if unavailable.
    }
  }

  const opponentLastResult =
    opponentLastFixture && match ? matchResult(opponentLastFixture, match.opponentId) : null;
  const opponentLastOpponent =
    opponentLastFixture && match
      ? opponentLastFixture.teams.home.id === match.opponentId
        ? opponentLastFixture.teams.away
        : opponentLastFixture.teams.home
      : null;
  const opponentNextOpponent =
    opponentNextFixture && match
      ? opponentNextFixture.teams.home.id === match.opponentId
        ? opponentNextFixture.teams.away
        : opponentNextFixture.teams.home
      : null;

  let videoRows: PreparationVideoRow[] = [];
  if (match) {
    const { data } = await supabase
      .from("preparation_videos")
      .select("id, url, notes")
      .eq("preparation_key", fixtureIdParam)
      .order("created_at", { ascending: false });

    videoRows = (data ?? []).map((row) => ({
      id: row.id,
      url: row.url,
      notes: row.notes,
      embedUrl: getVideoEmbedUrl(row.url),
    }));
  }

  let opponentSquad: {
    id: number;
    name: string;
    number: number | null;
    photo: string;
    position: string;
  }[] = [];
  let tacticalSnapshots: TacticalSnapshotRow[] = [];
  if (match) {
    const [squadResult, { data: tacticsRows }] = await Promise.all([
      getSquad(match.opponentId).catch(() => []),
      supabase
        .from("preparation_tactics")
        .select("id, positions, notes")
        .eq("preparation_key", fixtureIdParam)
        .order("created_at", { ascending: false }),
    ]);
    opponentSquad = (squadResult[0]?.players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      photo: p.photo,
      position: p.position,
    }));
    tacticalSnapshots = (tacticsRows ?? []).map((row) => {
      // Snapshots saved before the ball/markers/arrows toolbox stored a
      // plain player array in `positions`; newer ones store the full shape.
      const raw = row.positions as
        | TacticalPosition[]
        | {
            players?: TacticalPosition[];
            ball?: { x: number; y: number } | null;
            markers?: TacticalMarker[];
            arrows?: TacticalArrow[];
          }
        | null;
      const isLegacyArray = Array.isArray(raw);
      return {
        id: row.id,
        positions: isLegacyArray ? raw : (raw?.players ?? []),
        ball: isLegacyArray ? null : (raw?.ball ?? null),
        markers: isLegacyArray ? [] : (raw?.markers ?? []),
        arrows: isLegacyArray ? [] : (raw?.arrows ?? []),
        notes: row.notes,
      };
    });
  }

  const generalInfoContent = match && (
    <div>
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-muted">{t("injuriesTitle")}</h3>
        {opponentInjuries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("noInjuriesFound")}</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {opponentInjuries.map((injury) => (
              <Link
                key={injury.player.id}
                href={`/dashboard/clube/jogador/${injury.player.id}`}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface p-2.5 transition-colors hover:border-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={injury.player.photo}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{injury.player.name}</div>
                  <div className="line-clamp-2 text-xs text-muted">
                    {translateInjuryType(injury.player.reason, locale)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {opponentUnavailable.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-muted">{t("unavailableTitle")}</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {opponentUnavailable.map((injury) => (
              <Link
                key={injury.player.id}
                href={`/dashboard/clube/jogador/${injury.player.id}`}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface p-2.5 transition-colors hover:border-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={injury.player.photo}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{injury.player.name}</div>
                  <div className="line-clamp-2 text-xs text-muted">
                    {translateInjuryType(injury.player.reason, locale)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {headToHead.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-muted">{t("headToHeadTitle")}</h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {headToHead.map((fx) => (
              <div
                key={fx.fixture.id}
                className="rounded-lg border border-border bg-surface p-2.5 text-sm"
              >
                <Link
                  href={`/dashboard/clube/jogo/${fx.fixture.id}`}
                  className="block text-xs text-muted hover:text-accent"
                >
                  {new Date(fx.fixture.date).toLocaleDateString(locale)}
                </Link>
                <div className="mt-0.5 font-medium">
                  <Link href={`/dashboard/clube/${fx.teams.home.id}`} className="hover:text-accent">
                    {fx.teams.home.name}
                  </Link>{" "}
                  <Link href={`/dashboard/clube/jogo/${fx.fixture.id}`} className="hover:text-accent">
                    {fx.goals.home ?? "-"} - {fx.goals.away ?? "-"}
                  </Link>{" "}
                  <Link href={`/dashboard/clube/${fx.teams.away.id}`} className="hover:text-accent">
                    {fx.teams.away.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(opponentLastFixture || opponentNextFixture) && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-muted">{t("opponentScheduleTitle")}</h3>
          <div className="mt-2 space-y-2">
            {opponentLastFixture && opponentLastOpponent && (
              <Link
                href={`/dashboard/clube/jogo/${opponentLastFixture.fixture.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2.5 text-sm transition-colors hover:border-accent"
              >
                <span className="shrink-0 text-xs text-muted">{t("opponentLastMatchLabel")}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {opponentLastResult && (
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                        opponentLastResult === "W"
                          ? "bg-green-600"
                          : opponentLastResult === "L"
                            ? "bg-red-500"
                            : "bg-muted"
                      }`}
                    >
                      {opponentLastResult}
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={opponentLastOpponent.logo}
                    alt=""
                    className="h-4 w-4 shrink-0 object-contain"
                  />
                  <span className="truncate">{opponentLastOpponent.name}</span>
                  <span className="shrink-0 font-medium">
                    {opponentLastFixture.goals.home ?? "-"} - {opponentLastFixture.goals.away ?? "-"}
                  </span>
                </span>
              </Link>
            )}
            {opponentNextFixture && opponentNextOpponent && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-2.5 text-sm">
                <span className="shrink-0 text-xs text-muted">{t("opponentNextMatchLabel")}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={opponentNextOpponent.logo}
                    alt=""
                    className="h-4 w-4 shrink-0 object-contain"
                  />
                  <span className="truncate">{opponentNextOpponent.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {new Date(opponentNextFixture.fixture.date).toLocaleDateString(locale)}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {opponentStats && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-muted">{t("seasonStatsTitle")}</h3>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">{t("statPlayed")}</span>
              <span className="font-semibold">{opponentStats.fixtures.played.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">{t("statRecord")}</span>
              <span className="font-semibold">
                {opponentStats.fixtures.wins.total}-{opponentStats.fixtures.draws.total}-
                {opponentStats.fixtures.loses.total}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">{t("statGoals")}</span>
              <span className="font-semibold">
                {opponentStats.goals.for.total.total}:{opponentStats.goals.against.total.total}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">{t("statCleanSheets")}</span>
              <span className="font-semibold">{opponentStats.clean_sheet.total}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Rendered twice (normal width, then focus mode's wider layout) instead
  // of passed down as a function — Server Components can't hand a function
  // to a Client Component like PreparationTabs, only already-resolved JSX.
  function renderPreGameContent(sideBySide: boolean) {
    return (
      <div className="space-y-4">
        <details open className="group rounded-2xl border border-border bg-surface">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3 text-sm font-semibold">
            {t("tacticalAnalysisTitle")}
            <span className="text-muted transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-border p-4">
            <TacticalBoard
              preparationKey={fixtureIdParam}
              squad={opponentSquad}
              isCoach={isCoach}
              sideBySide={sideBySide}
            />

            <h4 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
              {t("tacticalSavedTitle")}
            </h4>
            <TacticalSnapshotList rows={tacticalSnapshots} isCoach={isCoach} />
          </div>
        </details>

        <details open className="group rounded-2xl border border-border bg-surface">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3 text-sm font-semibold">
            {t("videoAnalysisTitle")}
            <span className="text-muted transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-border p-4">
            <PreparationVideoList rows={videoRows} isCoach={isCoach} />
            {isCoach && <AddPreparationVideo preparationKey={fixtureIdParam} />}
          </div>
        </details>
      </div>
    );
  }

  const preGameContent = match ? renderPreGameContent(false) : null;
  const preGameContentFocus = match ? renderPreGameContent(true) : null;

  return (
    <div>
      <Link href="/dashboard/preparacoes" className="text-sm text-muted hover:text-foreground">
        ← {t("navPreparation")}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        {match
          ? t("preparationTitleForOpponent", { opponent: match.opponentName })
          : t("navPreparation")}
      </h1>

      {!match ? (
        <p className="mt-6 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          {t("preparationNoUpcomingFixture")}
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={match.opponentLogo} alt="" className="h-5 w-5 object-contain" />
              {new Date(match.date).toLocaleDateString(locale)} ·{" "}
              {new Date(match.date).toLocaleTimeString(locale, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>

            <Countdown
              target={match.date}
              labels={{
                days: t("countdownDays"),
                hours: t("countdownHours"),
                minutes: t("countdownMinutes"),
                seconds: t("countdownSeconds"),
                live: t("countdownLive"),
              }}
            />
          </div>

          <div className="mt-6">
            <PreparationTabs
              generalInfoContent={generalInfoContent}
              preGameContent={preGameContent}
              preGameContentFocus={preGameContentFocus}
              matchDate={match.date}
              opponentName={match.opponentName}
            />
          </div>
        </>
      )}
    </div>
  );
}
