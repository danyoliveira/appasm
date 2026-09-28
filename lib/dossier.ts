import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { DossierCategory } from "@/app/[locale]/(app)/actions";
import type { DossierFile } from "@/app/[locale]/(app)/club/TeamDossier";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DOSSIER_FILE_COLUMNS =
  "id, category, variant, period, title, storage_path, file_size, created_at, player_id, player_name";

// Dossier PDFs live in a private bucket — hand out short-lived signed
// links, generated in one batch for the whole list.
export async function loadDossierFiles(
  supabase: SupabaseServerClient,
  {
    teamId,
    stintId,
    categories,
    playerId,
  }: { teamId: number; stintId: string; categories: DossierCategory[]; playerId?: number },
): Promise<DossierFile[]> {
  let query = supabase
    .from("team_dossier_files")
    .select(DOSSIER_FILE_COLUMNS)
    .eq("team_id", teamId)
    .eq("stint_id", stintId)
    .in("category", categories);
  if (playerId != null) query = query.eq("player_id", playerId);
  const { data: rows } = await query
    .order("period", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (!rows?.length) return [];

  const { data: signed } = await supabase.storage.from("team-dossier").createSignedUrls(
    rows.map((row) => row.storage_path),
    60 * 60,
  );
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl] as const));
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    variant: row.variant,
    period: row.period,
    title: row.title,
    fileSize: row.file_size,
    createdAt: row.created_at,
    url: urlByPath.get(row.storage_path) ?? null,
    playerId: row.player_id,
    playerName: row.player_name,
  }));
}
