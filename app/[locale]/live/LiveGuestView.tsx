"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
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
} from "./actions";
import type { GuestLiveFeed, AutoLineupResult } from "./actions";
import ConfirmDialog from "../dashboard/ConfirmDialog";
import LineupEditor from "./LineupEditor";
import LiveFormationTeam from "./LiveFormationTeam";
import MatchClock from "./MatchClock";
import LiveFeedList from "./LiveFeedList";
import PlayerEventMenu from "./PlayerEventMenu";
import {
  applySubstitution,
  currentMatchMinute,
  LIVE_EVENT_ICON,
  removeFromField,
  restoreToField,
  type LineupPlayer,
  type LiveEntryRow,
  type LiveEventType,
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

// Icons for events already logged, keyed by player name — a name-based map
// (not an array aligned to a specific players list) so it covers a player
// whether they're currently on the pitch or subbed off to the bench.
function eventIconsByName(entries: LiveEntryRow[], side: "home" | "away"): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const entry of entries) {
    if (entry.teamSide !== side || !entry.eventType || !entry.playerName) continue;
    (map[entry.playerName] ??= []).push(LIVE_EVENT_ICON[entry.eventType]);
  }
  return map;
}

export default function LiveGuestView({
  token,
  initialFeed,
}: {
  token: string;
  initialFeed: GuestLiveFeed;
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
  const [eventMenuTarget, setEventMenuTarget] = useState<{ side: "home" | "away"; player: LineupPlayer } | null>(
    null,
  );
  const [substituteMode, setSubstituteMode] = useState(false);
  const [autoLineup, setAutoLineup] = useState<AutoLineupResult | null>(null);
  // Once true, this link no longer resolves to a session (regenerated by
  // the coach, most likely) — every write action below throws "Invalid
  // link" server-side, and polling gets null instead of a feed. Rather than
  // let that fail silently (stale screen, no explanation, mid-match), any
  // of those triggers this and the whole view switches to a clear message.
  const [linkExpired, setLinkExpired] = useState(false);

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

  // Shared by polling and every write action below — null means the token
  // stopped resolving to a session, so this is also where "the link died"
  // gets detected and surfaced, instead of the screen just going stale.
  async function refetchOrExpire(): Promise<boolean> {
    const next = await getLiveFeedByToken(token);
    if (next) {
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

  const handleKickoff = () => refreshAfter(() => markKickoffByToken(token));
  const handleHalftime = () => refreshAfter(() => markHalftimeByToken(token));
  const handleSecondHalf = () => refreshAfter(() => markSecondHalfByToken(token));
  const handleFullTime = () => refreshAfter(() => markFullTimeByToken(token));

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
            notes: `${t("liveStatsSubstituteOutShort")}: ${outPlayer.name}`,
          },
          guestName ?? "",
        );
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
    try {
      await saveTeamLineup(side, merged);
    } catch {
      setLinkExpired(true);
    }
  }

  if (linkExpired) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-muted">{t("liveStatsInvalidLink")}</p>
      </div>
    );
  }

  // Member needs a name before doing anything else, so every entry they log
  // is attributable — viewers never post, so they skip straight to the feed.
  if (role === "member" && guestName !== null && !guestName) {
    return <NameGate onSubmit={handleNameSubmit} />;
  }

  const stepTitle =
    step === "lineup"
      ? t("liveStatsMatchSheetTitle")
      : step === "formation"
        ? t("liveStatsFormationTitle")
        : t("liveStatsNotesTitle");

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

      <div className="flex items-center justify-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-accent/10 px-2.5 py-1 font-medium text-accent">
          {role === "member" ? t("liveStatsMemberBadge") : t("liveStatsViewerBadge")}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6 sm:gap-10">
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={match.homeLogo} alt="" className="h-12 w-12 object-contain" />
          <span className="max-w-[110px] truncate text-center text-sm font-medium">
            {match.homeName}
          </span>
        </div>
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
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={match.awayLogo} alt="" className="h-12 w-12 object-contain" />
          <span className="max-w-[110px] truncate text-center text-sm font-medium">
            {match.awayName}
          </span>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-6xl">
        {showMatchMode ? (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("liveStatsMatchModeTitle")}
              </h3>
              {canEdit && !match.startedAt && (
                <button
                  type="button"
                  onClick={() => setInMatchMode(false)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  ← {t("liveStatsBackToTabsButton")}
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LiveFormationTeam
                teamName={match.homeName}
                players={currentTeamLineup("home").players.filter((p) => p.starting)}
                substitutes={currentTeamLineup("home").players.filter((p) => !p.starting)}
                canEdit={canEdit}
                onChange={canEdit ? (players) => handleMatchModeFormationChange("home", players) : undefined}
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
                players={currentTeamLineup("away").players.filter((p) => p.starting)}
                substitutes={currentTeamLineup("away").players.filter((p) => !p.starting)}
                canEdit={canEdit}
                onChange={canEdit ? (players) => handleMatchModeFormationChange("away", players) : undefined}
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
              {t("liveStatsAddEventTitle")}
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
        ) : canEdit ? (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{stepTitle}</h3>
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
                />
                <LineupEditor
                  teamName={match.awayName}
                  lineup={{ players: awayDraft }}
                  canEdit={canEdit}
                  onChange={setAwayDraft}
                />
              </div>
            )}

            {step === "formation" && (
              <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <LiveFormationTeam
                  teamName={match.homeName}
                  players={homeFormationDraft}
                  canEdit={canEdit}
                  onChange={setHomeFormationDraft}
                />
                <LiveFormationTeam
                  teamName={match.awayName}
                  players={awayFormationDraft}
                  canEdit={canEdit}
                  onChange={setAwayFormationDraft}
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
                players={match.homeLineup.players.filter((p) => p.starting)}
                canEdit={false}
              />
              <LiveFormationTeam
                teamName={match.awayName}
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
