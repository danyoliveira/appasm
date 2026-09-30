"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { addPreparationVideo } from "../actions";
import type { VideoPlayerOption } from "./videoCategories";
import type { Team } from "./TacticalBoard";
import VideoForm, { type VideoFormValues } from "./VideoForm";

export default function AddPreparationVideo({
  preparationKey,
  players = [],
  team,
}: {
  preparationKey: string;
  players?: VideoPlayerOption[];
  team: Team;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  // Bumped after a save so the next form opens empty.
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(values: VideoFormValues) {
    setError(null);
    startSaving(async () => {
      try {
        await addPreparationVideo(
          preparationKey,
          values.url,
          values.notes,
          values.category,
          values.submoment,
          values.playerId,
          team,
        );
        setFormKey((k) => k + 1);
        setIsOpen(false);
        router.refresh();
      } catch {
        setError(t("liveConfigSaveError"));
      }
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        + {t("videoAddButton")}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <VideoForm
        key={formKey}
        title={t("videoAddButton")}
        players={players}
        isSaving={isSaving}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => {
          setError(null);
          setIsOpen(false);
        }}
      />
    </div>
  );
}
