// Which ASM Live Mode fields a club uses — collective counters and the
// goalkeeper's actions (in groups) — set by the coach on the "Configurar
// campos" page instead of being fixed in code.
//
// Counting never depends on this: every tap is stored under its field key,
// and a key's family is told by its prefix (goalkeeper keys start with
// "gk_"). The config only decides which fields are shown, how they're
// named, in which order and — for the goalkeeper — in which group.
//
// Each game freezes the config it kicked off with (live_match_sessions.
// stat_config), so changes only reach the games after it.

export interface LiveStatField {
  // Stable id stored on every tap — never changes, even on rename.
  key: string;
  // The coach's own name; null = the built-in (translated) name.
  label: string | null;
  // Switched off = not offered in new games (old games keep their data).
  active: boolean;
}

export interface LiveGkGroup {
  id: string;
  label: string | null;
  fields: LiveStatField[];
}

export interface LiveStatConfig {
  collective: LiveStatField[];
  gkGroups: LiveGkGroup[];
}

// Built-in fields' translated names (dashboard namespace).
export const BUILTIN_FIELD_LABEL_KEYS: Record<string, string> = {
  offensive_transition: "collectiveStatOffensiveTransitions",
  tackle: "collectiveStatTackles",
  interception: "collectiveStatInterceptions",
  recovery_own_half: "collectiveStatRecoveryOwnHalf",
  recovery_opp_half: "collectiveStatRecoveryOppHalf",
  progressive_pass: "collectiveStatProgressivePasses",
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

export const BUILTIN_GROUP_LABEL_KEYS: Record<string, string> = {
  gkGroupRestarts: "gkGroupRestarts",
  gkGroupBlocks: "gkGroupBlocks",
  gkGroupAerial: "gkGroupAerial",
  gkGroupExits: "gkGroupExits",
  gkGroupOther: "gkGroupOther",
};

const field = (key: string): LiveStatField => ({ key, label: null, active: true });

// Exactly what was fixed in code before — games from before the config
// existed are shown with it.
export const DEFAULT_LIVE_STAT_CONFIG: LiveStatConfig = {
  collective: [
    "offensive_transition",
    "tackle",
    "interception",
    "recovery_own_half",
    "recovery_opp_half",
    "progressive_pass",
  ].map(field),
  gkGroups: [
    { id: "gkGroupRestarts", label: null, fields: ["gk_reposicao", "gk_reposicao_mao", "gk_pontape_baliza"].map(field) },
    {
      id: "gkGroupBlocks",
      label: null,
      fields: ["gk_bloqueio_alto", "gk_bloqueio_medio", "gk_bloqueio_baixo", "gk_defesa_lateral_baixa"].map(field),
    },
    { id: "gkGroupAerial", label: null, fields: ["gk_cruzamentos", "gk_cruzamento_soco_desvio"].map(field) },
    { id: "gkGroupExits", label: null, fields: ["gk_saida_fora_area", "gk_saida_1x1"].map(field) },
    { id: "gkGroupOther", label: null, fields: ["gk_comunicacao", "gk_jogo_pes"].map(field) },
  ],
};

// --- Key families --------------------------------------------------------

export const isGkKey = (key: string | null | undefined): key is string =>
  !!key && key.startsWith("gk_") && key !== "gk_selection";

export const isCollectiveKey = (key: string | null | undefined): key is string =>
  !!key && key !== "possession" && !key.startsWith("gk_");

// --- Parsing (stored JSON -> config) -------------------------------------

function parseField(raw: unknown, family: "collective" | "gk"): LiveStatField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === "string" ? r.key : null;
  if (!key || (family === "gk" ? !isGkKey(key) : !isCollectiveKey(key))) return null;
  return {
    key,
    label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : null,
    active: r.active !== false,
  };
}

// Anything malformed falls back to the default rather than breaking a game.
export function parseLiveStatConfig(raw: unknown): LiveStatConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.collective) || !Array.isArray(r.gkGroups)) return null;
  const collective = r.collective
    .map((f) => parseField(f, "collective"))
    .filter((f): f is LiveStatField => f != null);
  const gkGroups = r.gkGroups
    .map((g): LiveGkGroup | null => {
      if (!g || typeof g !== "object") return null;
      const gr = g as Record<string, unknown>;
      if (typeof gr.id !== "string" || !Array.isArray(gr.fields)) return null;
      return {
        id: gr.id,
        label: typeof gr.label === "string" && gr.label.trim() ? gr.label.trim() : null,
        fields: gr.fields.map((f) => parseField(f, "gk")).filter((f): f is LiveStatField => f != null),
      };
    })
    .filter((g): g is LiveGkGroup => g != null);
  return { collective, gkGroups };
}

// The config a game shows: its own frozen copy once it kicked off (games
// from before configs existed: the default), or the club's current one
// while it hasn't started yet.
export function effectiveSessionConfig(
  session: { started_at: string | null; stat_config?: unknown },
  teamConfig: LiveStatConfig | null,
): LiveStatConfig {
  if (session.started_at) return parseLiveStatConfig(session.stat_config) ?? DEFAULT_LIVE_STAT_CONFIG;
  return teamConfig ?? DEFAULT_LIVE_STAT_CONFIG;
}

// --- What to show -----------------------------------------------------------

export const activeCollectiveFields = (config: LiveStatConfig) => config.collective.filter((f) => f.active);

export function activeGkGroups(config: LiveStatConfig): LiveGkGroup[] {
  return config.gkGroups
    .map((g) => ({ ...g, fields: g.fields.filter((f) => f.active) }))
    .filter((g) => g.fields.length > 0);
}

export const gkKeysOf = (groups: LiveGkGroup[]) => groups.flatMap((g) => g.fields.map((f) => f.key));

// Across several games (stats pages): the club's current active fields,
// then any other field those games actually used (switched off since, or
// only in an older config) — so no recorded data disappears.
export function displayCollectiveFields(current: LiveStatConfig, gameConfigs: LiveStatConfig[]): LiveStatField[] {
  const out = [...activeCollectiveFields(current)];
  const seen = new Set(out.map((f) => f.key));
  for (const cfg of gameConfigs) {
    for (const f of cfg.collective) {
      if (!f.active || seen.has(f.key)) continue;
      seen.add(f.key);
      out.push(current.collective.find((c) => c.key === f.key) ?? f);
    }
  }
  return out;
}

export function displayGkGroups(current: LiveStatConfig, gameConfigs: LiveStatConfig[]): LiveGkGroup[] {
  const groups = activeGkGroups(current).map((g) => ({ ...g, fields: [...g.fields] }));
  const seen = new Set(gkKeysOf(groups));
  const currentField = (key: string) =>
    current.gkGroups.flatMap((g) => g.fields).find((f) => f.key === key) ?? null;
  for (const cfg of gameConfigs) {
    for (const g of activeGkGroups(cfg)) {
      for (const f of g.fields) {
        if (seen.has(f.key)) continue;
        seen.add(f.key);
        // Into its group if that still exists, else a group of its own.
        let target = groups.find((x) => x.id === g.id);
        if (!target) {
          target = { ...g, fields: [] };
          groups.push(target);
        }
        target.fields.push(currentField(f.key) ?? f);
      }
    }
  }
  return groups;
}

// --- Labels -----------------------------------------------------------------

type Translate = (key: string) => string;

export function fieldLabel(f: { key: string; label: string | null }, t: Translate): string {
  if (f.label) return f.label;
  const builtin = BUILTIN_FIELD_LABEL_KEYS[f.key];
  return builtin ? t(builtin) : f.key;
}

export function groupLabel(g: { id: string; label: string | null }, t: Translate): string {
  if (g.label) return g.label;
  const builtin = BUILTIN_GROUP_LABEL_KEYS[g.id];
  return builtin ? t(builtin) : g.id;
}

// A new field's key: family prefix + something unique (never reused).
export function newFieldKey(family: "collective" | "gk"): string {
  const id = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return family === "gk" ? `gk_c_${id}` : `c_${id}`;
}

export function newGroupId(): string {
  return `grp_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
