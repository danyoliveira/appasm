"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, updateAvatarUrl, type ProfileFormState } from "../actions";

const initialState: ProfileFormState = {};

function cropToSquare(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas context"));
      ctx.drawImage(
        img,
        (img.width - size) / 2,
        (img.height - size) / 2,
        size,
        size,
        0,
        0,
        512,
        512,
      );
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("crop failed"))), "image/jpeg", 0.9);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function ProfileForm({
  userId,
  fullName,
  phone,
  avatarUrl,
}: {
  userId: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
}) {
  const t = useTranslations("dashboard");
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
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
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold">{t("profileSectionTitle")}</h2>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-background disabled:opacity-50"
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:max-w-sm">
        <label className="flex flex-col gap-1 text-sm">
          {t("fullNameLabel")}
          <input
            type="text"
            name="fullName"
            defaultValue={fullName ?? ""}
            className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("phoneLabel")}
          <input
            type="tel"
            name="phone"
            defaultValue={phone ?? ""}
            className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
          />
        </label>

        {state.success && (
          <p className="text-sm text-green-600">{t("profileSaved")}</p>
        )}
        {state.error && <p className="text-sm text-red-500">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-fit items-center rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t("saveProfileButton")}
        </button>
      </form>
    </div>
  );
}
