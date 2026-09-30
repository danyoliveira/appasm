"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cropToSquare } from "@/lib/cropToSquare";
import { updateProfile, updateAvatarUrl, type ProfileFormState } from "../actions";
import { SectionHeading } from "../OpponentScouting";

const initialState: ProfileFormState = {};

export default function ProfileForm({
  userId,
  fullName,
  phone,
  avatarUrl,
  email,
  roleLabel,
}: {
  userId: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  email: string | null;
  roleLabel: string;
}) {
  const t = useTranslations("dashboard");
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadFailed(false);
    try {
      const blob = await cropToSquare(file);
      const supabase = createClient();
      const path = `${userId}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;

      await updateAvatarUrl(bustedUrl);
      setPreview(bustedUrl);
    } catch {
      // It used to fail silently — the photo just didn't change.
      setUploadFailed(true);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <SectionHeading icon="user" title={t("profileSectionTitle")} />

      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label={t("profileChangePhoto")}
          className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-background shadow-sm disabled:opacity-50"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-muted">
              {t("addPhoto")}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? "..." : t("changePhoto")}
          </span>
        </button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold">{fullName || email}</span>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
              {roleLabel}
            </span>
          </div>
          {email && <div className="truncate text-sm text-muted">{email}</div>}
          {/* Visible on touch screens too — the hover overlay on the photo isn't. */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-1 text-xs font-medium text-accent hover:underline disabled:opacity-50"
          >
            {uploading ? t("savingClub") : t("profileChangePhoto")}
          </button>
          {uploadFailed && <p className="mt-1 text-xs text-red-500">{t("manualPlayerPhotoError")}</p>}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <form action={formAction} className="mt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("fullNameLabel")}
            <input
              type="text"
              name="fullName"
              defaultValue={fullName ?? ""}
              autoComplete="name"
              className="rounded-lg border border-border bg-background px-3 py-2 font-normal text-foreground outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("phoneLabel")}
            <input
              type="tel"
              name="phone"
              defaultValue={phone ?? ""}
              autoComplete="tel"
              className="rounded-lg border border-border bg-background px-3 py-2 font-normal text-foreground outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-fit items-center rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? t("savingClub") : t("saveProfileButton")}
          </button>
          {state.success && !pending && <p className="text-sm text-green-600">✓ {t("profileSaved")}</p>}
          {state.error && !pending && <p className="text-sm text-red-500">{t("liveConfigSaveError")}</p>}
        </div>
      </form>
    </div>
  );
}
