"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useTeamColors } from "../(app)/preparations/useTeamColors";
import {
  getLiveFeedByToken,
  saveLineupByToken,
  saveLiveLineupByToken,
  saveBenchNotesByToken,
  markKickoffByToken,
  markHalftimeByToken,
  markSecondHalfByToken,
  markFullTimeByToken,
  restartLiveSessionByToken,
  addLiveEntryByToken,
  deleteLiveEntryByToken,
  fetchAutoLineupByToken,
  addCollectiveStatByToken,
  undoCollectiveStatByToken,
  setPossessionByToken,
  setGkByToken,
  addGkStatByToken,
  undoGkStatByToken,
} from "./actions";
import type { GuestLiveFeed, AutoLineupResult } from "./actions";
import ConfirmDialog from "@/components/ConfirmDialog";
import LineupEditor from "./LineupEditor";
import LiveFormationTeam from "./LiveFormationTeam";
import MatchClock from "./MatchClock";
import LiveScoreboard from "./LiveScoreboard";
import LiveFeedList from "./LiveFeedList";
import PlayerEventMenu from "./PlayerEventMenu";
import CollectiveStatsPanel from "./CollectiveStatsPanel";
import GkStatsPanel from "./GkStatsPanel";
import MatchRecap from "./MatchRecap";
import {
  applySubstitution,
  currentMatchMinute,
  eventIconsByName,
  lineupPlayerId,
  countGoals,
  type LiveSquadPlayer,
  removeFromField,
  restoreToField,
  type CollectiveCounterKey,
  type GkCounterKey,
  type GkOutcome,
  type LineupPlayer,
  type LiveEventType,
  type PossessionSide,
  type TeamLineup,
} from "./liveStatsShared";

const POLL_MS = 4000;
const GUEST_NAME_KEY = "asm-live-guest-name";

// Reading localStorage can't happen during SSR, and reading it unguarded on
// the client's first hydration render would make that render disagree with
// the server-rendered HTML — useSyncExternalStore is the sanctioned way to
// read this once, safely, right after hydration (server snapshot null,
// matching the "not loaded yet" state below) instead of a mount effect.
const guestNameListeners = new Set<() => void>();

function subscribeToGuestName(onChange: () => void) {
  guestNameListeners.add(onChange);
  return () => guestNameListeners.delete(onChange);
}

function readGuestName(): string | null {
  try {
    return localStorage.getItem(GUEST_NAME_KEY);
  } catch {
    return "";
  }
}

function getServerGuestName() {
  return null;
}

function writeGuestName(name: string) {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name);
  } catch {
    // Ignore — not critical if it doesn't persist.
  }
  guestNameListeners.forEach((listener) => listener());
}

type MemberStep = "lineup" | "formation" | "notes";

function NameGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const t = useTranslations("dashboard");
  const [name, setName] = useState("");

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center px-4 text-center">
      <label className="mb-2 block text-sm text-muted">{t("liveStatsGuestNameLabel")}</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-center text-sm text-foreground outline-none focus:border-accent"
      />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => onSubmit(name.trim())}
        className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {t("liveStatsEnterButton")}
      </button>
    </div>
  );
}

// Merge an updated starting XI (order preserved, only x/y changes) back into
// the full players array — subs pass through untouched.
function mergeStarting(fullPlayers: LineupPlayer[], updatedStarting: LineupPlayer[]): LineupPlayer[] {
  let i = 0;
  return fullPlayers.map((p) => (p.starting ? updatedStarting[i++] : p));
}


export default function LiveGuestView({
  token,
  initialFeed,
  ourSquad = [],
  opponentSquad = [],
}: {
  token: string;
  initialFeed: GuestLiveFeed;
  // Our squad, to link lineup names to real players.
  ourSquad?: LiveSquadPlayer[];
  // The opponent's squad (API-Football clubs only) — same picker on their
  // side of the match sheet.
  opponentSquad?: LiveSquadPlayer[];
}) {
  const t = useTranslations("dashboard");
  const [feed, setFeed] = useState(initialFeed);
  const guestName = useSyncExternalStore(subscribeToGuestName, readGuestName, getServerGuestName);
  const [step, setStep] = useState<MemberStep>("lineup");
  // Member chooses when to move into Modo Jogo (via the confirm popup);
  // reloading the page after that already happened should land back there.
  const [inMatchMode, setInMatchMode] = useState(Boolean(initialFeed.match.startedAt));
  const [showMatchModeConfirm, setShowMatchModeConfirm] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  // Half-time and full-time can't be taken back (only "Reiniciar jogo",
  // which wipes the match) — a stray tap on the clock button asks first.
  const [phaseConfirm, setPhaseConfirm] = useState<"halftime" | "fulltime" | null>(null);
  const [eventMenuTarget, setEventMenuTarget] = useState<{ side: "home" | "away"; player: LineupPlayer } | null>(
    null,
  );
  const [substituteMode, setSubstituteMode] = useState(false);
  const [autoLineup, setAutoLineup] = useState<AutoLineupResult | null>(null);
  // Modo Jogo has three tabs (Jogo / Estatísticas / GK) — "seen" timestamps
  // track the latest activity the viewer has actually looked at in each, so
  // the others can flag themselves when something new lands while you're
  // away. Seeded from the initial load so nothing looks "new" on arrival.
  // A fourth tab (Pós-Jogo) only exists once the match has ended, and opens
  // by default in that case — someone opening the link after full-time
  // should land on the summary, not mid-match tabs that no longer update.
  const [selectedMatchModeTab, setMatchModeTab] = useState<"game" | "stats" | "gk" | "recap">(
    initialFeed.match.endedAt ? "recap" : "game",
  );
  const [lastSeenGameAt, setLastSeenGameAt] = useState<string | null>(
    initialFeed.entries[0]?.createdAt ?? null,
  );
  const [lastSeenStatsAt, setLastSeenStatsAt] = useState<string | null>(
    initialFeed.collectiveStats.lastStatAt,
  );
  const [lastSeenGkAt, setLastSeenGkAt] = useState<string | null>(initialFeed.gkStats.lastStatAt);
  // Once true, this link no longer resolves to a session (regenerated by
  // the coach, most likely) — every write action below throws "Invalid
  // link" server-side, and polling gets null instead of a feed. Rather than
  // let that fail silently (stale screen, no explanation, mid-match), any
  // of those triggers this and the whole view switches to a clear message.
  const [linkExpired, setLinkExpired] = useState(false);
  // One id per open tab, for as long as it stays open — lets the coach's
  // dashboard count distinct connected devices, not just "the token was
  // used." Regenerated on every mount (a reload counts as a new
  // connection), which is fine: presence is a live snapshot, not a log.
  const [connectionId] = useState(() => crypto.randomUUID());

  // The wizard owns every step's draft (instead of each child keeping its
  // own local state) so "Seguinte" can save before advancing — otherwise
  // switching steps silently discarded whatever hadn't been saved yet.
  const [homeDraft, setHomeDraft] = useState<LineupPlayer[]>(initialFeed.match.homeLineup.players);
  const [awayDraft, setAwayDraft] = useState<LineupPlayer[]>(initialFeed.match.awayLineup.players);
  const [homeFormationDraft, setHomeFormationDraft] = useState<LineupPlayer[]>(
    initialFeed.match.homeLineup.players.filter((p) => p.starting),
  );
  const [awayFormationDraft, setAwayFormationDraft] = useState<LineupPlayer[]>(
    initialFeed.match.awayLineup.players.filter((p) => p.starting),
  );
  const [notesDraft, setNotesDraft] = useState(initialFeed.match.benchNotes ?? "");
  const [isSavingStep, startSavingStep] = useTransition();
  // Pitch drags save in the background. A poll that was already in flight
  // (or started) while one was saving can bring back the old positions and
  // snap the players back — so those results are dropped, and the pitch
  // shows a short "a guardar" state that blocks the next drag until the
  // previous one is stored.
  const [savingFormationSide, setSavingFormationSide] = useState<"home" | "away" | null>(null);
  const pendingFormationSaves = useRef(0);
  const formationWriteSeq = useRef(0);

  // Shared by polling and every write action below — null means the token
  // stopped resolving to a session, so this is also where "the link died"
  // gets detected and surfaced, instead of the screen just going stale.
  async function refetchOrExpire(): Promise<boolean> {
    const seq = formationWriteSeq.current;
    const next = await getLiveFeedByToken(token, connectionId);
    if (next) {
      if (pendingFormationSaves.current > 0 || seq !== formationWriteSeq.current) return true;
      setFeed(next);
      return true;
    }
    setLinkExpired(true);
    return false;
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      const ok = await refetchOrExpire();
      if (!ok) clearInterval(interval);
    }, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Checked once, up front — API-Football only publishes lineups shortly
  // before kickoff, so this is often null; the "preencher automaticamente"
  // button below just doesn't show up when it is. Viewers have no token
  // this action accepts, so they skip it entirely.
  useEffect(() => {
    if (initialFeed.role !== "member") return;
    let cancelled = false;
    fetchAutoLineupByToken(token).then((result) => {
      if (!cancelled) setAutoLineup(result);
    });
    return () => {
      cancelled = true;
    };
  }, [token, initialFeed.role]);

  function handleNameSubmit(name: string) {
    writeGuestName(name);
  }

  const { match, role } = feed;
  const canEdit = role === "member";
  const ourSide = match.ourSide;
  // The summary tab only exists once the match is over — after "Reiniciar
  // jogo" (by this device or another) a view still parked on it falls back
  // to the formation instead of showing a 0–0 "final result".
  const matchModeTab = selectedMatchModeTab === "recap" && !match.endedAt ? "game" : selectedMatchModeTab;
  // Each club's own colour on its pitch tokens (the opponent's is nudged
  // away from ours when the two crests are too alike).
  const teamColors = useTeamColors(
    ourSide === "home" ? match.homeLogo : match.awayLogo,
    ourSide === "home" ? match.awayLogo : match.homeLogo,
  );
  const tokenColors = {
    home:
      ourSide === "home"
        ? { background: teamColors.usColor, text: teamColors.usTextColor }
        : { background: teamColors.opponentColor, text: teamColors.opponentTextColor },
    away:
      ourSide === "away"
        ? { background: teamColors.usColor, text: teamColors.usTextColor }
        : { background: teamColors.opponentColor, text: teamColors.opponentTextColor },
  };
  const ourTeamName = ourSide === "home" ? match.homeName : match.awayName;
  const ourGkStats = ourSide === "home" ? feed.gkStats.home : feed.gkStats.away;
  const ourGkIncomplete = ourSide === "home" ? feed.gkStats.homeIncomplete : feed.gkStats.awayIncomplete;
  const ourGkName = ourSide === "home" ? feed.gkStats.homeGkName : feed.gkStats.awayGkName;
  // Viewers have no wizard of their own — once the Member has started the
  // match, they're switched into the same read-only Modo Jogo board.
  const showMatchMode = canEdit ? inMatchMode : Boolean(match.startedAt);

  // Before kickoff, Modo Jogo is just previewing/tweaking the pre-game
  // config, so it reads/writes the same fields as the wizard. From kickoff
  // onward it switches to the live working copy, so match-time changes never
  // touch the frozen Ficha de Jogo/Formação Tática record.
  function currentTeamLineup(side: "home" | "away"): TeamLineup {
    if (match.startedAt) return side === "home" ? match.homeLineupLive : match.awayLineupLive;
    return side === "home" ? match.homeLineup : match.awayLineup;
  }

  function saveTeamLineup(side: "home" | "away", lineup: TeamLineup) {
    return match.startedAt
      ? saveLiveLineupByToken(token, side, lineup)
      : saveLineupByToken(token, side, lineup);
  }

  function handleApplyAutoLineup() {
    if (!autoLineup) return;
    setHomeDraft(autoLineup.home);
    setAwayDraft(autoLineup.away);
  }

  function handleLineupNext() {
    startSavingStep(async () => {
      try {
        await Promise.all([
          saveLineupByToken(token, "home", { players: homeDraft }),
          saveLineupByToken(token, "away", { players: awayDraft }),
        ]);
      } catch {
        setLinkExpired(true);
        return;
      }
      if (!(await refetchOrExpire())) return;
      setHomeFormationDraft(homeDraft.filter((p) => p.starting));
      setAwayFormationDraft(awayDraft.filter((p) => p.starting));
      setStep("formation");
    });
  }

  function handleFormationNext() {
    startSavingStep(async () => {
      try {
        await Promise.all([
          saveLineupByToken(token, "home", { players: mergeStarting(homeDraft, homeFormationDraft) }),
          saveLineupByToken(token, "away", { players: mergeStarting(awayDraft, awayFormationDraft) }),
        ]);
      } catch {
        setLinkExpired(true);
        return;
      }
      if (!(await refetchOrExpire())) return;
      setStep("notes");
    });
  }

  function handleFinishNotes() {
    startSavingStep(async () => {
      try {
        await saveBenchNotesByToken(token, notesDraft);
      } catch {
        setLinkExpired(true);
        return;
      }
      if (!(await refetchOrExpire())) return;
      setShowMatchModeConfirm(true);
    });
  }

  function handleConfirmMatchMode() {
    // Entering Modo Jogo is just switching screens — the match clock (and
    // locking the wizard back out) only starts once "Apito Inicial" is
    // pressed, so this stays freely reversible until kickoff.
    setShowMatchModeConfirm(false);
    setInMatchMode(true);
  }

  // Switching onto a tab marks its latest activity as "seen" so its own
  // badge clears; the *other* tabs' badges are untouched by this.
  function switchMatchModeTab(tab: "game" | "stats" | "gk" | "recap") {
    setMatchModeTab(tab);
    if (tab === "game") setLastSeenGameAt(feed.entries[0]?.createdAt ?? lastSeenGameAt);
    else if (tab === "stats") setLastSeenStatsAt(feed.collectiveStats.lastStatAt ?? lastSeenStatsAt);
    else if (tab === "gk") setLastSeenGkAt(feed.gkStats.lastStatAt ?? lastSeenGkAt);
  }

  const hasNewGameActivity =
    matchModeTab !== "game" &&
    feed.entries[0] != null &&
    (lastSeenGameAt == null ||
      new Date(feed.entries[0].createdAt).getTime() > new Date(lastSeenGameAt).getTime());

  const hasNewStatsActivity =
    matchModeTab !== "stats" &&
    feed.collectiveStats.lastStatAt != null &&
    (lastSeenStatsAt == null ||
      new Date(feed.collectiveStats.lastStatAt).getTime() > new Date(lastSeenStatsAt).getTime());

  const hasNewGkActivity =
    matchModeTab !== "gk" &&
    feed.gkStats.lastStatAt != null &&
    (lastSeenGkAt == null || new Date(feed.gkStats.lastStatAt).getTime() > new Date(lastSeenGkAt).getTime());

  function refreshAfter(action: () => Promise<void>) {
    startSavingStep(async () => {
      try {
        await action();
      } catch {
        setLinkExpired(true);
        return;
      }
      await refetchOrExpire();
    });
  }

  // Kick-off from the pre-game steps: store what is on screen first (the
  // sheet, the formation being dragged, the bench notes — otherwise edits
  // not yet confirmed with Seguinte were lost), then go straight to Modo
  // Jogo instead of leaving the coach on the match sheet with the clock
  // already running.
  const handleKickoff = () => {
    startSavingStep(async () => {
      try {
        if (!inMatchMode) {
          const placed = step !== "lineup";
          await Promise.all([
            saveLineupByToken(token, "home", {
              players: placed ? mergeStarting(homeDraft, homeFormationDraft) : homeDraft,
            }),
            saveLineupByToken(token, "away", {
              players: placed ? mergeStarting(awayDraft, awayFormationDraft) : awayDraft,
            }),
            saveBenchNotesByToken(token, notesDraft),
          ]);
        }
        await markKickoffByToken(token);
      } catch {
        setLinkExpired(true);
        return;
      }
      if (!(await refetchOrExpire())) return;
      setInMatchMode(true);
    });
  };
  const handleHalftime = () => setPhaseConfirm("halftime");
  const handleSecondHalf = () => refreshAfter(() => markSecondHalfByToken(token));
  const handleFullTime = () => setPhaseConfirm("fulltime");

  function handleConfirmPhase() {
    const phase = phaseConfirm;
    setPhaseConfirm(null);
    if (phase === "halftime") {
      refreshAfter(() => markHalftimeByToken(token));
    } else if (phase === "fulltime") {
      refreshAfter(() => markFullTimeByToken(token));
      // Straight to the summary — the mid-match tabs no longer change.
      setMatchModeTab("recap");
    }
  }

  // Counter taps show at once and save behind the scenes — waiting a second
  // or two per tap (with every button greyed out meanwhile) made it
  // impossible to keep up with a match. Same guard as the pitch drags: a
  // poll that overlaps a save is dropped, and once the last save lands the
  // screen is reconciled with what the server actually stored (so a tap
  // that failed simply falls back).
  function optimisticWrite(apply: (prev: GuestLiveFeed) => GuestLiveFeed, action: () => Promise<void>) {
    setFeed(apply);
    formationWriteSeq.current += 1;
    pendingFormationSaves.current += 1;
    action()
      .catch(() => {
        // Reconciled below; a dead link is caught by that refetch.
      })
      .finally(() => {
        pendingFormationSaves.current -= 1;
        formationWriteSeq.current += 1;
        if (pendingFormationSaves.current === 0) void refetchOrExpire();
      });
  }

  const bump = (counts: Record<string, number>, key: string, by: 1 | -1) => ({
    ...counts,
    [key]: Math.max(0, (counts[key] ?? 0) + by),
  });

  const handleSetPossession = (side: PossessionSide) =>
    optimisticWrite(
      (prev) => ({ ...prev, collectiveStats: { ...prev.collectiveStats, currentPossession: side } }),
      () => setPossessionByToken(token, side),
    );
  const changeCollective = (side: "home" | "away", key: CollectiveCounterKey, by: 1 | -1) =>
    optimisticWrite(
      (prev) => ({
        ...prev,
        collectiveStats: { ...prev.collectiveStats, [side]: bump(prev.collectiveStats[side], key, by) },
      }),
      () => (by === 1 ? addCollectiveStatByToken(token, key, side) : undoCollectiveStatByToken(token, key, side)),
    );
  const handleCollectiveIncrement = (side: "home" | "away", key: CollectiveCounterKey) =>
    changeCollective(side, key, 1);
  const handleCollectiveDecrement = (side: "home" | "away", key: CollectiveCounterKey) =>
    changeCollective(side, key, -1);

  const handleSetGk = (name: string) =>
    refreshAfter(() =>
      setGkByToken(token, ourSide, name, lineupPlayerId(currentTeamLineup(ourSide).players, name)),
    );
  const changeGk = (key: GkCounterKey, outcome: GkOutcome, by: 1 | -1) => {
    const field =
      outcome === "complete" ? ourSide : ourSide === "home" ? ("homeIncomplete" as const) : ("awayIncomplete" as const);
    optimisticWrite(
      (prev) => ({ ...prev, gkStats: { ...prev.gkStats, [field]: bump(prev.gkStats[field], key, by) } }),
      () =>
        by === 1 ? addGkStatByToken(token, ourSide, key, outcome) : undoGkStatByToken(token, ourSide, key, outcome),
    );
  };
  const handleGkIncrement = (key: GkCounterKey, outcome: GkOutcome) => changeGk(key, outcome, 1);
  const handleGkDecrement = (key: GkCounterKey, outcome: GkOutcome) => changeGk(key, outcome, -1);

  function handleConfirmRestart() {
    refreshAfter(() => restartLiveSessionByToken(token));
    setShowRestartConfirm(false);
  }

  function closeEventMenu() {
    setEventMenuTarget(null);
    setSubstituteMode(false);
  }

  function handleSelectEvent(eventType: LiveEventType) {
    if (!eventMenuTarget) return;
    const { side, player } = eventMenuTarget;
    startSavingStep(async () => {
      try {
        await addLiveEntryByToken(
          token,
          {
            eventType,
            teamSide: side,
            minute: currentMatchMinute(match),
            extraMinute: null,
            playerName: player.name,
            playerId: side === ourSide ? (player.playerId ?? null) : null,
            notes: "",
          },
          guestName ?? "",
        );
        // A red card sends the player off — no one comes on for them.
        if (eventType === "red_card") {
          const current = currentTeamLineup(side);
          await saveTeamLineup(side, { players: removeFromField(current.players, player.name) });
        }
      } catch {
        setLinkExpired(true);
        return;
      }
      if (!(await refetchOrExpire())) return;
      closeEventMenu();
    });
  }

  // Swap the outgoing (on-field) player for the incoming (bench) one in the
  // lineup, keep the incoming player's pitch position at the outgoing
  // player's spot, and log it as a substitution entry.
  function handleConfirmSubstitute(inPlayer: LineupPlayer) {
    if (!eventMenuTarget) return;
    const { side, player: outPlayer } = eventMenuTarget;
    startSavingStep(async () => {
      try {
        const current = currentTeamLineup(side);
        const updated = { players: applySubstitution(current.players, outPlayer.name, inPlayer.name) };
        await saveTeamLineup(side, updated);
        await addLiveEntryByToken(
          token,
          {
            eventType: "substitution",
            teamSide: side,
            minute: currentMatchMinute(match),
            extraMinute: null,
            playerName: inPlayer.name,
            playerId: side === ourSide ? (inPlayer.playerId ?? null) : null,
            notes: `${t("liveStatsSubstituteOutShort")}: ${outPlayer.name}`,
          },
          guestName ?? "",
        );
        // Our goalkeeper came off: whoever came on takes over in goal, so
        // Modo GK keeps crediting the right keeper without re-picking.
        if (side === ourSide && outPlayer.name === ourGkName) {
          await setGkByToken(token, ourSide, inPlayer.name, inPlayer.playerId ?? null);
        }
      } catch {
        setLinkExpired(true);
        return;
      }
      if (!(await refetchOrExpire())) return;
      closeEventMenu();
    });
  }

  function handleDeleteEntry(id: string) {
    const entry = feed.entries.find((e) => e.id === id);
    refreshAfter(async () => {
      await deleteLiveEntryByToken(token, id);
      // Undo the auto-removal a red card caused when it was logged.
      if (entry?.eventType === "red_card" && entry.teamSide && entry.playerName) {
        const side = entry.teamSide;
        const current = currentTeamLineup(side);
        await saveTeamLineup(side, { players: restoreToField(current.players, entry.playerName) });
      }
      // Undo a substitution: the player who came on goes back to the bench
      // and the one who went off returns to the same spot — only while that
      // still makes sense (the sub hasn't since been subbed off / sent off).
      if (entry?.eventType === "substitution" && entry.teamSide && entry.playerName) {
        const side = entry.teamSide;
        const inName = entry.playerName;
        const outName = entry.notes?.includes(": ") ? entry.notes.slice(entry.notes.indexOf(": ") + 2).trim() : "";
        const current = currentTeamLineup(side);
        const inPlayer = current.players.find((p) => p.name === inName);
        const outPlayer = current.players.find((p) => p.name === outName);
        if (inPlayer?.starting && outPlayer && !outPlayer.starting) {
          await saveTeamLineup(side, { players: applySubstitution(current.players, inName, outName) });
          // The keeper change it triggered is undone too.
          if (side === ourSide && ourGkName === inName) {
            await setGkByToken(token, ourSide, outName, outPlayer.playerId ?? null);
          }
        }
      }
    });
  }

  // Live, immediate save on every drag — Modo Jogo is meant to be nudged
  // throughout the match, not batched behind a "Seguinte" button.
  async function handleMatchModeFormationChange(side: "home" | "away", updatedStarting: LineupPlayer[]) {
    const current = currentTeamLineup(side);
    const merged = { players: mergeStarting(current.players, updatedStarting) };
    const key = match.startedAt
      ? side === "home"
        ? "homeLineupLive"
        : "awayLineupLive"
      : side === "home"
        ? "homeLineup"
        : "awayLineup";
    setFeed((prev) => ({
      ...prev,
      match: {
        ...prev.match,
        [key]: merged,
      },
    }));
    formationWriteSeq.current += 1;
    pendingFormationSaves.current += 1;
    setSavingFormationSide(side);
    try {
      await saveTeamLineup(side, merged);
    } catch {
      setLinkExpired(true);
    } finally {
      pendingFormationSaves.current -= 1;
      formationWriteSeq.current += 1;
      if (pendingFormationSaves.current === 0) setSavingFormationSide(null);
    }
  }

  if (linkExpired) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-muted">{t("liveStatsInvalidLink")}</p>
      </div>
    );
  }

  // GK Coach gets none of the wizard/tabs machinery — just the score/clock
  // for context and their one job. No name gate either: they never post an
  // attributable event, only GK counter taps.
  if (role === "gk_coach") {
    return (
      <div className="w-full px-4 py-6">
        <LiveScoreboard
          roleLabel={t("liveStatsGkCoachBadge")}
          homeName={match.homeName}
          awayName={match.awayName}
          homeLogo={match.homeLogo}
          awayLogo={match.awayLogo}
          homeScore={match.startedAt ? countGoals(feed.entries, "home") : null}
          awayScore={match.startedAt ? countGoals(feed.entries, "away") : null}
          colors={{ home: tokenColors.home.background, away: tokenColors.away.background }}
        >
          <MatchClock
            startedAt={match.startedAt}
            halftimeAt={match.halftimeAt}
            secondHalfAt={match.secondHalfAt}
            endedAt={match.endedAt}
            canControl={false}
            onKickoff={() => {}}
            onHalftime={() => {}}
            onSecondHalf={() => {}}
            onFullTime={() => {}}
            onRestart={() => {}}
          />
        </LiveScoreboard>

        <div className="mx-auto mt-6 max-w-3xl">
          <GkStatsPanel
            stats={ourGkStats}
            incompleteStats={ourGkIncomplete}
            gkName={ourGkName}
            teamName={ourTeamName}
            players={currentTeamLineup(ourSide).players}
            canEdit
            isPending={isSavingStep}
            onSelectGk={handleSetGk}
            onIncrement={handleGkIncrement}
            onDecrement={handleGkDecrement}
            statConfig={feed.statConfig}
          />
        </div>
      </div>
    );
  }

  // Member needs a name before doing anything else, so every entry they log
  // is attributable — viewers never post, so they skip straight to the feed.
  if (role === "member" && guestName !== null && !guestName) {
    return <NameGate onSubmit={handleNameSubmit} />;
  }

  return (
    <div className="w-full px-4 py-6">
      <ConfirmDialog
        open={showMatchModeConfirm}
        message={t("liveStatsMatchModeConfirmMessage")}
        isPending={isSavingStep}
        tone="accent"
        confirmLabel={t("liveStatsMatchModeConfirmButton")}
        onConfirm={handleConfirmMatchMode}
        onCancel={() => setShowMatchModeConfirm(false)}
      />
      <ConfirmDialog
        open={showRestartConfirm}
        message={t("liveStatsRestartConfirmMessage")}
        isPending={isSavingStep}
        confirmLabel={t("liveStatsRestartButton")}
        onConfirm={handleConfirmRestart}
        onCancel={() => setShowRestartConfirm(false)}
      />
      <ConfirmDialog
        open={phaseConfirm !== null}
        message={phaseConfirm === "fulltime" ? t("liveStatsFullTimeConfirm") : t("liveStatsHalftimeConfirm")}
        confirmLabel={phaseConfirm === "fulltime" ? t("liveStatsFullTimeButton") : t("liveStatsHalftimeButton")}
        isPending={isSavingStep}
        onConfirm={handleConfirmPhase}
        onCancel={() => setPhaseConfirm(null)}
      />
      <PlayerEventMenu
        open={eventMenuTarget != null}
        mode={substituteMode ? "substitute" : "menu"}
        playerName={eventMenuTarget?.player.name ?? ""}
        playerNumber={eventMenuTarget?.player.number ?? null}
        benchPlayers={
          eventMenuTarget
            ? currentTeamLineup(eventMenuTarget.side).players.filter((p) => !p.starting && p.name.trim())
            : []
        }
        isPending={isSavingStep}
        onSelectEvent={handleSelectEvent}
        onRequestSubstitute={() => setSubstituteMode(true)}
        onConfirmSubstitute={handleConfirmSubstitute}
        onBack={() => setSubstituteMode(false)}
        onCancel={closeEventMenu}
      />

      <LiveScoreboard
        roleLabel={role === "member" ? t("liveStatsMemberBadge") : t("liveStatsViewerBadge")}
        homeName={match.homeName}
        awayName={match.awayName}
        homeLogo={match.homeLogo}
        awayLogo={match.awayLogo}
        homeScore={match.startedAt ? countGoals(feed.entries, "home") : null}
        awayScore={match.startedAt ? countGoals(feed.entries, "away") : null}
        colors={{ home: tokenColors.home.background, away: tokenColors.away.background }}
      >
        <MatchClock
          startedAt={match.startedAt}
          halftimeAt={match.halftimeAt}
          secondHalfAt={match.secondHalfAt}
          endedAt={match.endedAt}
          canControl={canEdit}
          onKickoff={handleKickoff}
          onHalftime={handleHalftime}
          onSecondHalf={handleSecondHalf}
          onFullTime={handleFullTime}
          onRestart={() => setShowRestartConfirm(true)}
        />
      </LiveScoreboard>

      <div className="mx-auto mt-6 max-w-6xl">
        {showMatchMode ? (
          <>
            {canEdit && !match.startedAt && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setInMatchMode(false)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  ← {t("liveStatsBackToTabsButton")}
                </button>
              </div>
            )}

            {/* Full-width, equal-split tabs with generous padding so
                they're easy to hit by thumb pitch-side. */}
            <div className="mt-3 flex gap-1 rounded-2xl border border-border bg-surface p-1 shadow-sm">
              {(
                [
                  ...(match.endedAt
                    ? [{ key: "recap" as const, label: t("liveStatsRecapTabLabel"), hasNew: false }]
                    : []),
                  { key: "game" as const, label: t("liveStatsGameTabLabel"), hasNew: hasNewGameActivity },
                  { key: "stats" as const, label: t("liveStatsStatsTabLabel"), hasNew: hasNewStatsActivity },
                  { key: "gk" as const, label: t("liveStatsGkTabLabel"), hasNew: hasNewGkActivity },
                ]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => switchMatchModeTab(tab.key)}
                  className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                    matchModeTab === tab.key
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.hasNew && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                </button>
              ))}
            </div>

            {matchModeTab === "recap" ? (
              <div className="mt-4">
                <MatchRecap
                  tokenColors={tokenColors}
                  homeLogo={match.homeLogo}
                  awayLogo={match.awayLogo}
                  preparationKey={match.preparationKey}
                  homeName={match.homeName}
                  awayName={match.awayName}
                  homePlayers={currentTeamLineup("home").players}
                  awayPlayers={currentTeamLineup("away").players}
                  ourPlayers={currentTeamLineup(ourSide).players}
                  entries={feed.entries}
                  collectiveStats={feed.collectiveStats}
                  ourGkStats={ourGkStats}
                  ourGkIncomplete={ourGkIncomplete}
                  ourGkName={ourGkName}
                  ourGkStatsByPlayer={ourSide === "home" ? feed.gkStats.homeByPlayer : feed.gkStats.awayByPlayer}
                  ourTeamName={ourTeamName}
                  statConfig={feed.statConfig}
                />
              </div>
            ) : matchModeTab === "game" ? (
              <>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <LiveFormationTeam
                    teamName={match.homeName}
                    tokenColor={tokenColors.home}
                    players={currentTeamLineup("home").players.filter((p) => p.starting)}
                    substitutes={currentTeamLineup("home").players.filter((p) => !p.starting)}
                    canEdit={canEdit}
                    onChange={canEdit ? (players) => handleMatchModeFormationChange("home", players) : undefined}
                    saving={savingFormationSide === "home"}
                    onPlayerClick={
                      canEdit
                        ? (player) => {
                            setSubstituteMode(false);
                            setEventMenuTarget({ side: "home", player });
                          }
                        : undefined
                    }
                    eventIcons={eventIconsByName(feed.entries, "home")}
                  />
                  <LiveFormationTeam
                    teamName={match.awayName}
                    tokenColor={tokenColors.away}
                    players={currentTeamLineup("away").players.filter((p) => p.starting)}
                    substitutes={currentTeamLineup("away").players.filter((p) => !p.starting)}
                    canEdit={canEdit}
                    onChange={canEdit ? (players) => handleMatchModeFormationChange("away", players) : undefined}
                    saving={savingFormationSide === "away"}
                    onPlayerClick={
                      canEdit
                        ? (player) => {
                            setSubstituteMode(false);
                            setEventMenuTarget({ side: "away", player });
                          }
                        : undefined
                    }
                    eventIcons={eventIconsByName(feed.entries, "away")}
                  />
                </div>

                <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("liveStatsEventsListTitle")}
                </h3>
                <div className="mt-2">
                  <LiveFeedList
                    entries={feed.entries}
                    homeName={match.homeName}
                    awayName={match.awayName}
                    onDelete={canEdit ? handleDeleteEntry : undefined}
                  />
                </div>
              </>
            ) : matchModeTab === "stats" ? (
              <div className="mt-4">
                <CollectiveStatsPanel
                  tokenColors={tokenColors}
                  stats={feed.collectiveStats}
                  homeName={match.homeName}
                  awayName={match.awayName}
                  canEdit={canEdit}
                  isPending={isSavingStep}
                  onSetPossession={canEdit ? handleSetPossession : undefined}
                  onIncrement={canEdit ? handleCollectiveIncrement : undefined}
                  onDecrement={canEdit ? handleCollectiveDecrement : undefined}
                  statConfig={feed.statConfig}
                />
              </div>
            ) : (
              <div className="mt-4">
                <GkStatsPanel
                  stats={ourGkStats}
                  incompleteStats={ourGkIncomplete}
                  gkName={ourGkName}
                  teamName={ourTeamName}
                  players={currentTeamLineup(ourSide).players}
                  canEdit={canEdit}
                  isPending={isSavingStep}
                  onSelectGk={canEdit ? handleSetGk : undefined}
                  onIncrement={canEdit ? handleGkIncrement : undefined}
                  onDecrement={canEdit ? handleGkDecrement : undefined}
                  statConfig={feed.statConfig}
                />
              </div>
            )}
          </>
        ) : canEdit ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              {/* Where you are in the pre-game steps. */}
              <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                {(
                  [
                    { key: "lineup", label: t("liveStatsMatchSheetTitle") },
                    { key: "formation", label: t("liveStatsFormationTitle") },
                    { key: "notes", label: t("liveStatsNotesTitle") },
                  ] as const
                ).map((item, index, all) => {
                  const current = all.findIndex((x) => x.key === step);
                  const state = index < current ? "done" : index === current ? "current" : "todo";
                  return (
                    <li key={item.key} className="flex items-center gap-1.5">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          state === "current"
                            ? "bg-accent text-accent-foreground"
                            : state === "done"
                              ? "bg-green-600 text-white"
                              : "bg-surface text-muted ring-1 ring-border"
                        }`}
                      >
                        {state === "done" ? "✓" : index + 1}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          state === "current" ? "text-foreground" : "hidden text-muted sm:inline"
                        }`}
                      >
                        {item.label}
                      </span>
                      {index < all.length - 1 && <span aria-hidden className="mx-1 h-px w-4 bg-border sm:w-6" />}
                    </li>
                  );
                })}
              </ol>
              <div className="flex items-center gap-2">
                {step === "lineup" && autoLineup && (
                  <button
                    type="button"
                    onClick={handleApplyAutoLineup}
                    className="rounded-full border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                  >
                    ⚡ {t("liveStatsAutoFillButton")}
                  </button>
                )}
                {step !== "lineup" && (
                  <button
                    type="button"
                    onClick={() => setStep(step === "notes" ? "formation" : "lineup")}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    ← {t("liveStatsBackButton")}
                  </button>
                )}
                {step === "lineup" && (
                  <button
                    type="button"
                    disabled={isSavingStep}
                    onClick={handleLineupNext}
                    className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {isSavingStep ? t("savingClub") : `${t("liveStatsNextButton")} →`}
                  </button>
                )}
                {step === "formation" && (
                  <button
                    type="button"
                    disabled={isSavingStep}
                    onClick={handleFormationNext}
                    className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {isSavingStep ? t("savingClub") : `${t("liveStatsNextButton")} →`}
                  </button>
                )}
                {step === "notes" && (
                  <button
                    type="button"
                    disabled={isSavingStep}
                    onClick={handleFinishNotes}
                    className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {isSavingStep ? t("savingClub") : t("liveStatsFinishButton")}
                  </button>
                )}
              </div>
            </div>

            {step === "lineup" && (
              <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <LineupEditor
                  teamName={match.homeName}
                  lineup={{ players: homeDraft }}
                  canEdit={canEdit}
                  onChange={setHomeDraft}
                  squad={ourSide === "home" ? ourSquad : opponentSquad}
                />
                <LineupEditor
                  teamName={match.awayName}
                  lineup={{ players: awayDraft }}
                  canEdit={canEdit}
                  onChange={setAwayDraft}
                  squad={ourSide === "away" ? ourSquad : opponentSquad}
                />
              </div>
            )}

            {step === "formation" && (
              <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <LiveFormationTeam
                  teamName={match.homeName}
                  tokenColor={tokenColors.home}
                  players={homeFormationDraft}
                  canEdit={canEdit}
                  onChange={setHomeFormationDraft}
                  showPresets
                />
                <LiveFormationTeam
                  teamName={match.awayName}
                  tokenColor={tokenColors.away}
                  players={awayFormationDraft}
                  canEdit={canEdit}
                  onChange={setAwayFormationDraft}
                  showPresets
                />
              </div>
            )}

            {step === "notes" && (
              <div className="mt-2">
                <label className="mb-1 block text-xs text-muted">{t("liveStatsNotesLabel")}</label>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={6}
                  className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>
            )}
          </>
        ) : (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("liveStatsFormationTitle")}
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LiveFormationTeam
                teamName={match.homeName}
                tokenColor={tokenColors.home}
                players={match.homeLineup.players.filter((p) => p.starting)}
                canEdit={false}
              />
              <LiveFormationTeam
                teamName={match.awayName}
                tokenColor={tokenColors.away}
                players={match.awayLineup.players.filter((p) => p.starting)}
                canEdit={false}
              />
            </div>

            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
              {t("liveStatsMatchSheetTitle")}
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LineupEditor teamName={match.homeName} lineup={match.homeLineup} canEdit={false} />
              <LineupEditor teamName={match.awayName} lineup={match.awayLineup} canEdit={false} />
            </div>

            {match.benchNotes && (
              <>
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("liveStatsNotesTitle")}
                </h3>
                <p className="mt-2 whitespace-pre-wrap rounded-2xl border border-border bg-background p-4 text-sm">
                  {match.benchNotes}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
