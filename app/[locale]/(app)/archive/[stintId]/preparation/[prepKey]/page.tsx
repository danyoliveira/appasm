import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getTeamInfo, getFixtureById, getSquad } from "@/lib/api-football/cache";
import { getVideoEmbedUrl } from "@/lib/videoEmbed";
import type { TacticalMarker, TacticalArrow, TacticalPosition } from "../../../../actions";
import BackLink from "../../../../BackLink";
import PreparationVideoList, {
  type PreparationVideoRow,
} from "../../../../preparations/PreparationVideoList";
import TacticalSnapshotList, {
  type TacticalSnapshotRow,
} from "../../../../preparations/TacticalSnapshotList";

// Snapshots saved before the ball/markers/arrows toolbox stored a plain
// player array in `positions`; newer ones store the full shape — same
// backward-compat parsing as the live preparation page.
type LegacyPosition = Omit<TacticalPosition, "team"> & { team?: "us" | "opponent" };

export default async function ArchivedPreparationPage({
  params,
}: {
  params: Promise<{ locale: Locale; stintId: string; prepKey: string }>;
}) {
  const { locale, stintId, prepKey } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: stint } = await supabase
    .from("coaching_stints")
    .select("id, team_id, started_at, ended_at")
    .eq("id", stintId)
    .not("ended_at", "is", null)
    .maybeSingle();

  if (!stint) {
    return (
      <div>
        <BackLink href="/archive" label={t("archiveTitle")} />
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          {t("archiveStintNotFound")}
        </p>
      </div>
    );
  }

  let opponentName = "";
  let opponentLogo = "";
  let opponentId: number | null = null;
  let matchDate: string | null = null;
  let scoreLine: string | null = null;

  if (prepKey.startsWith("manual-")) {
    const manualId = prepKey.slice("manual-".length);
    const { data: manual } = await supabase
      .from("manual_preparations")
      .select("opponent_team_id, match_date")
      .eq("id", manualId)
      .maybeSingle();
    if (manual) {
      matchDate = manual.match_date;
      opponentId = manual.opponent_team_id;
      const info = await getTeamInfo(manual.opponent_team_id).catch(() => []);
      opponentName = info[0]?.team.name ?? "";
      opponentLogo = info[0]?.team.logo ?? "";
    }
  } else {
    const fixtureId = Number(prepKey);
    const detail = (await getFixtureById(fixtureId).catch(() => []))[0] ?? null;
    if (detail) {
      const isHome = detail.teams.home.id === stint.team_id;
      const opponent = isHome ? detail.teams.away : detail.teams.home;
      opponentId = opponent.id;
      opponentName = opponent.name;
      opponentLogo = opponent.logo;
      matchDate = detail.fixture.date;
      if (detail.goals.home != null && detail.goals.away != null) {
        scoreLine = `${detail.goals.home} - ${detail.goals.away}`;
      }
    }
  }

  const [{ data: tacticsRows }, { data: videoRows }, ourSquadResult, opponentSquadResult] =
    await Promise.all([
      supabase
        .from("preparation_tactics")
        .select("id, positions, notes, video_url")
        .eq("team_id", stint.team_id)
        .eq("preparation_key", prepKey)
        .order("created_at", { ascending: false }),
      supabase
        .from("preparation_videos")
        .select("id, url, notes, category, player_id, team")
        .eq("team_id", stint.team_id)
        .eq("preparation_key", prepKey)
        .order("created_at", { ascending: false }),
      supabase
        .from("archived_squad_players")
        .select("player_id, name, photo")
        .eq("stint_id", stint.id),
      opponentId ? getSquad(opponentId).catch(() => []) : Promise.resolve([]),
    ]);

  const ourSquadById = new Map(
    (ourSquadResult.data ?? []).map((p) => [p.player_id, { id: p.player_id, name: p.name, photo: p.photo ?? "" }]),
  );
  const opponentSquadById = new Map(
    (opponentSquadResult[0]?.players ?? []).map((p) => [p.id, { id: p.id, name: p.name, photo: p.photo }]),
  );

  const totalSnapshots = tacticsRows?.length ?? 0;
  const tacticalSnapshots: TacticalSnapshotRow[] = (tacticsRows ?? []).map((row, i) => {
    const raw = row.positions as
      | LegacyPosition[]
      | {
          players?: LegacyPosition[];
          ball?: { x: number; y: number } | null;
          markers?: TacticalMarker[];
          arrows?: TacticalArrow[];
          team?: "us" | "opponent";
        }
      | null;
    const isLegacyArray = Array.isArray(raw);
    const rawPlayers = isLegacyArray ? raw : (raw?.players ?? []);
    return {
      id: row.id,
      title: t("videoSnapshotOption", { index: totalSnapshots - i }),
      positions: rawPlayers.map((p) => ({ ...p, team: p.team ?? "opponent" })),
      team: (isLegacyArray ? undefined : raw?.team) ?? "opponent",
      ball: isLegacyArray ? null : (raw?.ball ?? null),
      markers: isLegacyArray ? [] : (raw?.markers ?? []),
      arrows: isLegacyArray ? [] : (raw?.arrows ?? []),
      notes: row.notes,
      videoUrl: row.video_url,
      videoEmbedUrl: row.video_url ? getVideoEmbedUrl(row.video_url) : null,
    };
  });

  const videos: PreparationVideoRow[] = (videoRows ?? []).map((row) => {
    const player = row.player_id
      ? (opponentSquadById.get(row.player_id) ?? ourSquadById.get(row.player_id) ?? null)
      : null;
    return {
      id: row.id,
      url: row.url,
      notes: row.notes,
      embedUrl: getVideoEmbedUrl(row.url),
      category: row.category,
      player,
      team: row.team,
    };
  });

  return (
    <div>
      <BackLink href={`/archive/${stint.id}`} label={t("archiveTitle")} />

      {opponentName && (
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {opponentLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={opponentLogo} alt="" className="h-12 w-12 object-contain" />
          )}
          <div>
            <div className="text-lg font-semibold">{opponentName}</div>
            <div className="text-sm text-muted">
              {matchDate && new Date(matchDate).toLocaleDateString(locale)}
              {scoreLine && ` · ${scoreLine}`}
            </div>
          </div>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("tacticalAnalysisTitle")}</h2>
        <TacticalSnapshotList rows={tacticalSnapshots} isCoach={false} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("videoAnalysisTitle")}</h2>
        <PreparationVideoList rows={videos} isCoach={false} />
      </section>
    </div>
  );
}
