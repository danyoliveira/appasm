"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { getLogoColor } from "@/lib/logoColor";
import Icon from "@/components/Icon";
import { createManualPreparation } from "../actions";
import ManualPreparationForm, { type CompetitionOption } from "../preparations/ManualPreparationForm";

export interface CalendarRow {
  id: number;
  date: string;
  // null for a game created from scratch against a club outside API-Football.
  opponent: { id: number | null; name: string; logo: string };
  competition: { name: string; logo: string } | null;
  isHome: boolean;
  result: "W" | "D" | "L" | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  finished: boolean;
  // Set for games created from scratch — their preparation key
  // ("manual-<uuid>"); links go to the preparation instead of a fixture page.
  manualKey?: string;
}

const PAGE_SIZE = 5;
const FORM_SIZE = 5;

const RESULT_STYLE: Record<"W" | "D" | "L", { badge: string; bar: string }> = {
  W: { badge: "bg-green-600 text-white", bar: "bg-green-600" },
  D: { badge: "bg-muted text-white", bar: "bg-muted" },
  L: { badge: "bg-red-500 text-white", bar: "bg-red-500" },
};

// Whole days from today to `iso` (local calendar days, not 24h blocks).
function daysUntil(iso: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

export default function FixtureCalendar({
  past,
  future,
  locale,
  logoUrl,
  labels,
  canAddGames = false,
  competitions = [],
  title,
}: {
  past: CalendarRow[];
  future: CalendarRow[];
  locale: string;
  logoUrl?: string | null;
  labels: {
    dateTime: string;
    opponent: string;
    competition: string;
    venue: string;
    result: string;
    home: string;
    away: string;
    showMorePast: string;
    showMoreFuture: string;
    noFixturesFound: string;
    nextFixture: string;
  };
  // Coach only: "+ Adicionar jogo" (creates a game from scratch).
  canAddGames?: boolean;
  competitions?: CompetitionOption[];
  // When set, the calendar renders its own heading, with "+ Adicionar jogo"
  // on the same line.
  title?: string;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [pastCount, setPastCount] = useState(PAGE_SIZE);
  const [futureCount, setFutureCount] = useState(PAGE_SIZE);

  // Same crest-color extractor used across the club pages — accents the
  // next-fixture highlight with the club's own color.
  const [clubColor, setClubColor] = useState<string | null>(null);
  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    getLogoColor(logoUrl).then((c) => {
      if (!cancelled) setClubColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  const addButton = canAddGames ? (
    <button
      type="button"
      onClick={() => setAddOpen(true)}
      className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <Icon name="plus" className="h-3.5 w-3.5" />
      {t("calendarAddGame")}
    </button>
  ) : null;

  const addDialog = addOpen ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{t("calendarAddGameTitle")}</h3>
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            aria-label={t("cancelButton")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="px-5 py-4">
          <ManualPreparationForm
            submitLabel={t("calendarAddGameSave")}
            isSaving={isSaving}
            competitions={competitions}
            onCancel={() => setAddOpen(false)}
            onSubmit={(opponent, matchDateIso, details) => {
              if (!opponent) return;
              startSaving(async () => {
                await createManualPreparation(opponent, matchDateIso, details);
                setAddOpen(false);
                router.refresh();
              });
            }}
          />
        </div>
      </div>
    </div>
  ) : null;

  const header =
    title || addButton ? (
      <div className="flex items-center justify-between gap-3">
        {title ? <h2 className="text-lg font-semibold">{title}</h2> : <span />}
        {addButton}
      </div>
    ) : null;

  if (past.length === 0 && future.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        <p className="text-sm text-muted">{labels.noFixturesFound}</p>
        {addDialog}
      </div>
    );
  }

  const resultShort = (r: "W" | "D" | "L") => t(`liveStatsResultShort${r}`);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const relativeDay = (iso: string) => {
    const days = daysUntil(iso);
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(days, "day");
  };

  const next = future[0] ?? null;
  const upcoming = future.slice(next ? 1 : 0, futureCount + 1);
  const recent = past.slice(0, pastCount);
  const form = past
    .filter((r) => r.result)
    .slice(0, FORM_SIZE)
    .reverse();

  // Clubs created by hand (outside API-Football) may have no crest — show a
  // neutral shield instead of an <img> with an empty src.
  function renderCrest(logo: string, size: string) {
    return logo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" className={`${size} shrink-0 object-contain`} />
    ) : (
      <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-background text-muted`}>
        <Icon name="shield" className="h-1/2 w-1/2" />
      </span>
    );
  }

  function renderDateBlock(iso: string) {
    const d = new Date(iso);
    return (
      <div className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-background py-1 leading-none">
        <span className="text-[10px] font-medium uppercase text-muted">
          {d.toLocaleDateString(locale, { month: "short" }).replace(".", "")}
        </span>
        <span className="mt-0.5 text-base font-semibold tabular-nums">{d.getDate()}</span>
      </div>
    );
  }

  function renderVenuePill(isHome: boolean) {
    return (
      <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted">
        {isHome ? labels.home : labels.away}
      </span>
    );
  }

  // Two links per row: the opponent (crest + name) opens the opponent
  // club's page — for every game, upcoming or played, API or created from
  // scratch — and the score opens the match page, which only a finished API
  // fixture has.
  function renderRow(row: CalendarRow) {
    const style = row.result ? RESULT_STYLE[row.result] : null;
    const opponentHref = row.opponent.id != null ? `/club/${row.opponent.id}` : null;
    const matchHref = !row.manualKey && row.finished ? `/club/fixture/${row.id}` : null;

    const opponent = (
      <>
        {renderCrest(row.opponent.logo, "h-7 w-7")}
        <span className="truncate text-sm font-medium">{row.opponent.name}</span>
      </>
    );

    const score =
      row.finished && row.result && style ? (
        <>
          <span className="text-sm font-semibold tabular-nums">
            {row.goalsFor ?? "-"}–{row.goalsAgainst ?? "-"}
          </span>
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold ${style.badge}`}
          >
            {resultShort(row.result)}
          </span>
        </>
      ) : null;

    return (
      <div
        key={row.manualKey ?? row.id}
        className="relative flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-background"
      >
        {style && <span className={`absolute inset-y-2 left-0 w-0.5 rounded-full ${style.bar}`} />}
        {renderDateBlock(row.date)}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {opponentHref ? (
              <Link
                href={opponentHref}
                className="flex min-w-0 items-center gap-2 hover:text-accent hover:underline"
              >
                {opponent}
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-2">{opponent}</span>
            )}
            {renderVenuePill(row.isHome)}
            {row.manualKey && (
              <span
                className="shrink-0 rounded-full bg-sky-500/10 px-1.5 py-px text-[10px] font-medium text-sky-700 dark:text-sky-400"
                title={t("calendarManualGameHint")}
              >
                {t("manualPlayerBadge")}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 pl-9 text-xs text-muted">
            {row.competition?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.competition.logo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
            )}
            <span className="truncate">{row.competition?.name ?? "—"}</span>
          </div>
        </div>
        {score ? (
          matchHref ? (
            <Link
              href={matchHref}
              title={t("calendarOpenMatch")}
              className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface hover:text-accent"
            >
              {score}
            </Link>
          ) : (
            <div className="flex shrink-0 items-center gap-2 px-1.5 py-1">{score}</div>
          )
        ) : (
          <span className="shrink-0 text-sm font-medium tabular-nums text-muted">{time(row.date)}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${header ? "" : "mt-4"}`}>
      {header}
      {addDialog}
      {/* Next fixture + form */}
      {(next || form.length > 0) && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {next && (
            <div
              className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm"
              style={clubColor ? { borderLeft: `4px solid ${clubColor}` } : undefined}
            >
              <div
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: clubColor ?? undefined }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {labels.nextFixture}
                <span className="font-medium normal-case tracking-normal text-muted">
                  · {relativeDay(next.date)}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4">
                {renderCrest(next.opponent.logo, "h-12 w-12")}
                <div className="min-w-0 flex-1">
                  {next.opponent.id != null ? (
                    <Link
                      href={`/club/${next.opponent.id}`}
                      className="block truncate text-lg font-semibold hover:text-accent"
                    >
                      {next.opponent.name}
                    </Link>
                  ) : (
                    <span className="block truncate text-lg font-semibold">{next.opponent.name}</span>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                    <span className="capitalize">
                      {new Date(next.date).toLocaleDateString(locale, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </span>
                    <span>· {time(next.date)}</span>
                    {renderVenuePill(next.isHome)}
                  </div>
                  {next.competition && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      {next.competition.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={next.competition.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                      )}
                      {next.competition.name}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {form.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {t("calendarFormTitle")}
              </div>
              <div className="mt-3 flex gap-1.5">
                {form.map((row) => {
                  const badgeClass = `flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                    RESULT_STYLE[row.result!].badge
                  }`;
                  const title = `${row.opponent.name} ${row.goalsFor}–${row.goalsAgainst}`;
                  return row.manualKey ? (
                    <span key={row.manualKey} title={title} className={badgeClass}>
                      {resultShort(row.result!)}
                    </span>
                  ) : (
                    <Link
                      key={row.id}
                      href={`/club/fixture/${row.id}`}
                      title={title}
                      className={`${badgeClass} transition-transform hover:-translate-y-0.5`}
                    >
                      {resultShort(row.result!)}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-muted">{t("calendarFormHint")}</div>
            </div>
          )}
        </div>
      )}

      {/* Latest results / upcoming */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-2 shadow-sm">
          <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t("calendarRecentTitle")}
          </h3>
          {recent.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">{labels.noFixturesFound}</p>
          ) : (
            <div className="space-y-0.5">{recent.map(renderRow)}</div>
          )}
          {pastCount < past.length && (
            <button
              type="button"
              onClick={() => setPastCount((c) => c + PAGE_SIZE)}
              className="mt-1 w-full rounded-lg py-1.5 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              {labels.showMorePast}
            </button>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-2 shadow-sm">
          <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t("calendarUpcomingTitle")}
          </h3>
          {upcoming.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">{labels.noFixturesFound}</p>
          ) : (
            <div className="space-y-0.5">{upcoming.map(renderRow)}</div>
          )}
          {futureCount < future.length - 1 && (
            <button
              type="button"
              onClick={() => setFutureCount((c) => c + PAGE_SIZE)}
              className="mt-1 w-full rounded-lg py-1.5 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              {labels.showMoreFuture}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
