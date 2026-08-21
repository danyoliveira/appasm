"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COMPETITION_FILTER_COOKIE } from "@/lib/api-football/teamStats";

export async function setCompetitionFilter(formData: FormData) {
  const value = formData.get("competicao")?.toString() ?? "all";
  const store = await cookies();
  store.set(COMPETITION_FILTER_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
