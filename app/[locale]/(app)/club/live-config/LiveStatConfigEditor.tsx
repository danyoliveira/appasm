"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icon";
import { saveLiveStatConfig } from "../../actions";
import {
  BUILTIN_FIELD_LABEL_KEYS,
  BUILTIN_GROUP_LABEL_KEYS,
  DEFAULT_LIVE_STAT_CONFIG,
  newFieldKey,
  newGroupId,
  type LiveGkGroup,
  type LiveStatConfig,
  type LiveStatField,
} from "../../../live/liveStatConfig";

type Tab = "collective" | "gk";

const move = <T,>(list: T[], index: number, delta: number): T[] => {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
};

const iconButton =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

// "Configurar campos": the club's ASM Live Mode fields — collective counters
// and the goalkeeper's actions in groups. Rename, reorder, switch off, add.
// Nothing is ever deleted (a switched-off field keeps its recorded data),
// and changes only reach games that haven't kicked off yet.
export default function LiveStatConfigEditor({ initialConfig }: { initialConfig: LiveStatConfig }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [config, setConfig] = useState<LiveStatConfig>(initialConfig);
  const [saved, setSaved] = useState<LiveStatConfig>(initialConfig);
  const [tab, setTab] = useState<Tab>("collective");
  const [newCollective, setNewCollective] = useState("");
  const [newGkField, setNewGkField] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isSaving, startSaving] = useTransition();

  const dirty = JSON.stringify(config) !== JSON.stringify(saved);

  // --- names -----------------------------------------------------------------
  const builtinFieldName = (key: string) => (BUILTIN_FIELD_LABEL_KEYS[key] ? t(BUILTIN_FIELD_LABEL_KEYS[key]) : null);
  const fieldName = (f: LiveStatField) => f.label ?? builtinFieldName(f.key) ?? f.key;
  const builtinGroupName = (id: string) => (BUILTIN_GROUP_LABEL_KEYS[id] ? t(BUILTIN_GROUP_LABEL_KEYS[id]) : null);
  const groupName = (g: LiveGkGroup) => g.label ?? builtinGroupName(g.id) ?? "";
  // Typing the built-in name back means "use the built-in (translated) one".
  const labelFrom = (value: string, builtin: string | null) => {
    const v = value.trim();
    return !v || v === builtin ? null : v;
  };

  // --- updates -----------------------------------------------------------------
  const setCollective = (collective: LiveStatField[]) => setConfig((c) => ({ ...c, collective }));
  const setGroups = (gkGroups: LiveGkGroup[]) => setConfig((c) => ({ ...c, gkGroups }));
  const updateGroup = (id: string, fn: (g: LiveGkGroup) => LiveGkGroup) =>
    setGroups(config.gkGroups.map((g) => (g.id === id ? fn(g) : g)));

  function addCollective() {
    const name = newCollective.trim();
    if (!name) return;
    setCollective([...config.collective, { key: newFieldKey("collective"), label: name, active: true }]);
    setNewCollective("");
  }

  function addGkField(groupId: string) {
    const name = (newGkField[groupId] ?? "").trim();
    if (!name) return;
    updateGroup(groupId, (g) => ({ ...g, fields: [...g.fields, { key: newFieldKey("gk"), label: name, active: true }] }));
    setNewGkField((prev) => ({ ...prev, [groupId]: "" }));
  }

  function addGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setGroups([...config.gkGroups, { id: newGroupId(), label: name, fields: [] }]);
    setNewGroupName("");
  }

  function moveGkField(fromGroupId: string, key: string, toGroupId: string) {
    const field = config.gkGroups.find((g) => g.id === fromGroupId)?.fields.find((f) => f.key === key);
    if (!field || fromGroupId === toGroupId) return;
    setGroups(
      config.gkGroups.map((g) =>
        g.id === fromGroupId
          ? { ...g, fields: g.fields.filter((f) => f.key !== key) }
          : g.id === toGroupId
            ? { ...g, fields: [...g.fields, field] }
            : g,
      ),
    );
  }

  function save() {
    setNotice(null);
    startSaving(async () => {
      try {
        await saveLiveStatConfig(config);
        setSaved(config);
        setNotice({ tone: "ok", text: t("liveConfigSaved") });
        router.refresh();
      } catch {
        setNotice({ tone: "error", text: t("liveConfigSaveError") });
      }
    });
  }

  // --- rendering ---------------------------------------------------------------
  function renderFieldRow(
    f: LiveStatField,
    index: number,
    count: number,
    onChange: (next: LiveStatField) => void,
    onMove: (delta: number) => void,
    extra?: React.ReactNode,
  ) {
    const builtin = builtinFieldName(f.key);
    return (
      <div
        key={f.key}
        className={`flex flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap ${f.active ? "" : "bg-background/60"}`}
      >
        <div className="flex shrink-0 flex-col">
          <button type="button" className={`${iconButton} h-4`} disabled={index === 0} onClick={() => onMove(-1)} aria-label={t("liveConfigMoveUp")}>
            <span className="text-[10px]">▲</span>
          </button>
          <button type="button" className={`${iconButton} h-4`} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t("liveConfigMoveDown")}>
            <span className="text-[10px]">▼</span>
          </button>
        </div>
        <input
          type="text"
          value={fieldName(f)}
          onChange={(e) => onChange({ ...f, label: labelFrom(e.target.value, builtin) })}
          className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none hover:border-border focus:border-accent focus:bg-background ${
            f.active ? "" : "text-muted line-through decoration-muted/50"
          }`}
        />
        {extra}
        <button
          type="button"
          role="switch"
          aria-checked={f.active}
          onClick={() => onChange({ ...f, active: !f.active })}
          title={f.active ? t("liveConfigTurnOff") : t("liveConfigTurnOn")}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${f.active ? "bg-green-600" : "bg-border"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${f.active ? "left-[18px]" : "left-0.5"}`}
          />
        </button>
      </div>
    );
  }

  function renderAddRow(value: string, onChange: (v: string) => void, onAdd: () => void, placeholder: string) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon name="plus" className="h-4 w-4 text-muted" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted"
        />
        <button
          type="button"
          disabled={!value.trim()}
          onClick={onAdd}
          className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-40"
        >
          {t("liveConfigAdd")}
        </button>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "collective", label: t("collectiveStatsTitle"), count: config.collective.filter((f) => f.active).length },
    {
      key: "gk",
      label: t("gkStatsTitle"),
      count: config.gkGroups.flatMap((g) => g.fields).filter((f) => f.active).length,
    },
  ];

  return (
    <div>
      <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm">
        <Icon name="bell" className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" />
        <p className="text-muted">{t("liveConfigNextGameHint")}</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-border bg-background p-0.5">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === tb.key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {tb.label}
              <span className="text-xs tabular-nums opacity-60">{tb.count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="text-xs font-medium text-muted hover:text-foreground"
        >
          {t("liveConfigResetDefault")}
        </button>
      </div>

      {tab === "collective" ? (
        <section className="mt-4">
          <p className="mb-2 text-xs text-muted">{t("liveConfigCollectiveHint")}</p>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {config.collective.map((f, i) =>
              renderFieldRow(
                f,
                i,
                config.collective.length,
                (next) => setCollective(config.collective.map((x) => (x.key === f.key ? next : x))),
                (delta) => setCollective(move(config.collective, i, delta)),
              ),
            )}
            {renderAddRow(newCollective, setNewCollective, addCollective, t("liveConfigNewFieldPlaceholder"))}
          </div>
        </section>
      ) : (
        <section className="mt-4 space-y-4">
          <p className="text-xs text-muted">{t("liveConfigGkHint")}</p>
          {config.gkGroups.map((g, gi) => (
            <div key={g.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="flex items-center gap-2 border-b border-border bg-background/60 px-3 py-2">
                <div className="flex shrink-0 flex-col">
                  <button type="button" className={`${iconButton} h-4`} disabled={gi === 0} onClick={() => setGroups(move(config.gkGroups, gi, -1))} aria-label={t("liveConfigMoveUp")}>
                    <span className="text-[10px]">▲</span>
                  </button>
                  <button type="button" className={`${iconButton} h-4`} disabled={gi === config.gkGroups.length - 1} onClick={() => setGroups(move(config.gkGroups, gi, 1))} aria-label={t("liveConfigMoveDown")}>
                    <span className="text-[10px]">▼</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={groupName(g)}
                  onChange={(e) => updateGroup(g.id, (x) => ({ ...x, label: labelFrom(e.target.value, builtinGroupName(g.id)) }))}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold uppercase tracking-wide outline-none hover:border-border focus:border-accent focus:bg-surface"
                />
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {g.fields.filter((f) => f.active).length}/{g.fields.length}
                </span>
                {g.fields.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setGroups(config.gkGroups.filter((x) => x.id !== g.id))}
                    className={`${iconButton} hover:text-red-500`}
                    aria-label={t("deleteButton")}
                    title={t("deleteButton")}
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="divide-y divide-border">
                {g.fields.map((f, i) =>
                  renderFieldRow(
                    f,
                    i,
                    g.fields.length,
                    (next) => updateGroup(g.id, (x) => ({ ...x, fields: x.fields.map((y) => (y.key === f.key ? next : y)) })),
                    (delta) => updateGroup(g.id, (x) => ({ ...x, fields: move(x.fields, i, delta) })),
                    config.gkGroups.length > 1 ? (
                      <select
                        value={g.id}
                        onChange={(e) => moveGkField(g.id, f.key, e.target.value)}
                        aria-label={t("liveConfigMoveToGroup")}
                        title={t("liveConfigMoveToGroup")}
                        className="max-w-[9rem] shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted outline-none focus:border-accent"
                      >
                        {config.gkGroups.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {groupName(opt)}
                          </option>
                        ))}
                      </select>
                    ) : null,
                  ),
                )}
                {renderAddRow(
                  newGkField[g.id] ?? "",
                  (v) => setNewGkField((prev) => ({ ...prev, [g.id]: v })),
                  () => addGkField(g.id),
                  t("liveConfigNewActionPlaceholder"),
                )}
              </div>
            </div>
          ))}
          <div className="rounded-2xl border border-dashed border-border bg-surface">
            {renderAddRow(newGroupName, setNewGroupName, addGroup, t("liveConfigNewGroupPlaceholder"))}
          </div>
        </section>
      )}

      {/* Save bar — sticks to the bottom while there are unsaved changes. */}
      <div
        className={`sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg transition-colors ${
          dirty ? "border-accent/40 bg-surface" : "border-border bg-surface/80"
        }`}
      >
        <p
          className={`text-sm ${
            notice ? (notice.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-500") : "text-muted"
          }`}
        >
          {notice && !dirty ? notice.text : dirty ? t("liveConfigUnsaved") : t("liveConfigNoChanges")}
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setConfig(saved)}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              {t("liveConfigDiscard")}
            </button>
          )}
          <button
            type="button"
            disabled={!dirty || isSaving}
            onClick={save}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground shadow-sm hover:opacity-90 disabled:opacity-40"
          >
            {isSaving ? t("savingClub") : t("liveConfigSave")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        tone="accent"
        message={t("liveConfigResetConfirm")}
        confirmLabel={t("liveConfigResetDefault")}
        onConfirm={() => {
          // Built-ins back to default; the club's own fields stay, switched off.
          const keep = (list: LiveStatField[], defaults: LiveStatField[]) =>
            list.filter((f) => !defaults.some((d) => d.key === f.key)).map((f) => ({ ...f, active: false }));
          const defaultGkFields = DEFAULT_LIVE_STAT_CONFIG.gkGroups.flatMap((g) => g.fields);
          const ownGk = keep(config.gkGroups.flatMap((g) => g.fields), defaultGkFields);
          setConfig({
            collective: [...DEFAULT_LIVE_STAT_CONFIG.collective, ...keep(config.collective, DEFAULT_LIVE_STAT_CONFIG.collective)],
            gkGroups: [
              ...DEFAULT_LIVE_STAT_CONFIG.gkGroups,
              ...(ownGk.length ? [{ id: newGroupId(), label: t("liveConfigOwnFieldsGroup"), fields: ownGk }] : []),
            ],
          });
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
