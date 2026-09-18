"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CounterRow } from "./CollectiveStatsPanel";
import { type GkCounterKey, type GkStatsByPlayer, type GkStatsSide, type LineupPlayer } from "./liveStatsShared";

const GK_LABEL_KEYS: Record<GkCounterKey, string> = {
  gk_reposicao: "gkStatReposicao",
  gk_reposicao_mao: "gkStatReposicaoMao",
  gk_bloqueio_medio: "gkStatBloqueioMedio",
  gk_bloqueio_alto: "gkStatBloqueioAlto",
  gk_bloqueio_baixo: "gkStatBloqueioBaixo",
  gk_defesa_lateral_baixa: "gkStatDefesaLateralBaixa",
  gk_pontape_baliza: "gkStatPontapeBaliza",
  gk_saida_fora_area: "gkStatSaidaForaArea",
  gk_comunicacao: "gkStatComunicacao",
  gk_saida_1x1: "gkStatSaida1x1",
  gk_cruzamento_soco_desvio: "gkStatCruzamentoSocoDesvio",
  gk_cruzamentos: "gkStatCruzamentos",
  gk_jogo_pes: "gkStatJogoPes",
};

// Grouped instead of one long flat list — reads more like a proper
// goalkeeping report (restarts / shot-stopping / aerial / sweeping / other)
// than a plain counter dump, and keeps each group short enough to scan.
const GK_GROUPS: { titleKey: string; keys: GkCounterKey[] }[] = [
  { titleKey: "gkGroupRestarts", keys: ["gk_reposicao", "gk_reposicao_mao", "gk_pontape_baliza"] },
  {
    titleKey: "gkGroupBlocks",
    keys: ["gk_bloqueio_alto", "gk_bloqueio_medio", "gk_bloqueio_baixo", "gk_defesa_lateral_baixa"],
  },
  { titleKey: "gkGroupAerial", keys: ["gk_cruzamentos", "gk_cruzamento_soco_desvio"] },
  { titleKey: "gkGroupExits", keys: ["gk_saida_fora_area", "gk_saida_1x1"] },
  { titleKey: "gkGroupOther", keys: ["gk_comunicacao", "gk_jogo_pes"] },
];

// Goalkeepers overwhelmingly wear #1 — used as a one-tap-to-confirm default
// instead of making the coach hunt for the name in a list every time.
function guessGkName(startingPlayers: LineupPlayer[]): string | null {
  return startingPlayers.find((p) => p.number === 1)?.name ?? null;
}

// Same card + row shape as CollectiveStatsPanel's per-side breakdown, so the
// two stat sections in the Pós-Jogo recap read as one consistent design
// instead of two different systems.
function GkGroupCards({
  stats,
  canEdit,
  isPending,
  onIncrement,
  onDecrement,
}: {
  stats: GkStatsSide;
  canEdit: boolean;
  isPending: boolean;
  onIncrement?: (key: GkCounterKey) => void;
  onDecrement?: (key: GkCounterKey) => void;
}) {
  const t = useTranslations("dashboard");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {GK_GROUPS.map((group) => (
        <div key={group.titleKey} className="rounded-2xl border border-border bg-background p-4">
          <h4 className="text-sm font-semibold">{t(group.titleKey)}</h4>
          <div className="mt-2 divide-y divide-border">
            {group.keys.map((key) => (
              <CounterRow
                key={key}
                label={t(GK_LABEL_KEYS[key])}
                value={stats[key]}
                canEdit={canEdit}
                isPending={isPending}
                onIncrement={() => onIncrement?.(key)}
                onDecrement={() => onDecrement?.(key)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GkIdentityHeader({
  number,
  name,
  teamName,
}: {
  number: number | null;
  name: string;
  teamName: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-900 text-base font-bold text-white shadow ring-2 ring-accent/50">
        {number ?? "-"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{teamName}</p>
        <p className="truncate text-lg font-semibold">{name}</p>
      </div>
    </div>
  );
}

export default function GkStatsPanel({
  stats,
  gkName,
  teamName,
  players,
  canEdit,
  isPending = false,
  onSelectGk,
  onIncrement,
  onDecrement,
  byPlayer,
}: {
  stats: GkStatsSide;
  gkName: string | null;
  teamName: string;
  players: LineupPlayer[];
  canEdit: boolean;
  isPending?: boolean;
  onSelectGk?: (name: string) => void;
  onIncrement?: (key: GkCounterKey) => void;
  onDecrement?: (key: GkCounterKey) => void;
  // Read-only recap only: every keeper who was credited with a stat this
  // match. When there's more than one (a mid-match keeper change), each
  // gets their own card instead of collapsing everything into whoever
  // ended the match in goal.
  byPlayer?: GkStatsByPlayer[];
}) {
  const t = useTranslations("dashboard");
  const [manualPicking, setManualPicking] = useState(false);

  const startingPlayers = players.filter((p) => p.starting && p.name.trim());
  const namedPlayers = players.filter((p) => p.name.trim());
  // The confirmed keeper leaving the starting XI (sub, red card) means the
  // confirmation no longer holds — re-prompt instead of silently keeping
  // score for someone who isn't even on the pitch anymore.
  const gkStillStarting = gkName != null && startingPlayers.some((p) => p.name === gkName);
  const needsConfirm = canEdit && !gkStillStarting;
  const showPicker = needsConfirm || manualPicking;
  const suggestedName = needsConfirm ? guessGkName(startingPlayers) : null;

  function confirm(name: string) {
    onSelectGk?.(name);
    setManualPicking(false);
  }

  if (!showPicker && byPlayer && byPlayer.length > 1) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("gkStatsTitle")}</h3>
        <div className="mt-2 space-y-4">
          {byPlayer.map((entry) => (
            <div key={entry.name}>
              <GkIdentityHeader
                number={players.find((p) => p.name === entry.name)?.number ?? null}
                name={entry.name}
                teamName={teamName}
              />
              <div className="mt-3">
                <GkGroupCards stats={entry.stats} canEdit={false} isPending={false} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const gkNumber = gkName ? (players.find((p) => p.name === gkName)?.number ?? null) : null;

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("gkStatsTitle")}</h3>

      <div className="mt-2 rounded-2xl border border-border bg-background p-4">
        {showPicker ? (
          <div className="space-y-2">
            {needsConfirm && suggestedName && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow ring-2 ring-accent/50">
                    {startingPlayers.find((p) => p.name === suggestedName)?.number ?? "1"}
                  </div>
                  <span className="text-sm font-medium">{t("gkSuggestedLabel", { name: suggestedName })}</span>
                </div>
                <button
                  type="button"
                  onClick={() => confirm(suggestedName)}
                  disabled={isPending}
                  className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {t("gkConfirmButton")}
                </button>
              </div>
            )}
            <select
              value=""
              onChange={(e) => e.target.value && confirm(e.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="">{t("gkSelectPlaceholder")}</option>
              {namedPlayers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : gkName ? (
          <div className="flex items-center gap-3">
            <GkIdentityHeader number={gkNumber} name={gkName} teamName={teamName} />
            {canEdit && (
              <button
                type="button"
                onClick={() => setManualPicking(true)}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
              >
                {t("gkChangeButton")}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("gkNoSelectionHint")}</p>
        )}
      </div>

      {gkName && !showPicker && (
        <div className="mt-4">
          <GkGroupCards
            stats={stats}
            canEdit={canEdit}
            isPending={isPending}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
          />
        </div>
      )}
    </div>
  );
}
