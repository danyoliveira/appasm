import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getTeamInfo } from "@/lib/api-football/cache";
import BackLink from "../BackLink";
import RecentNotesPanel from "./RecentNotesPanel";
import { loadTeamNotes } from "./loadTeamNotes";

// Every note of the club and its players in one place — search, type and
// player filters, sorting. The dashboard only shows the latest few and
// links here.
export default async function NotesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: coachProfile }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("api_football_team_id").eq("role", "coach").maybeSingle(),
  ]);
  const teamId = coachProfile?.api_football_team_id ?? null;
  const isCoach = profile?.role === "coach";

  if (!isCoach || !teamId) {
    return (
      <div>
        <BackLink href="/dashboard" label={t("navDashboard")} />
        <p className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
          {t("recentNotesEmpty")}
        </p>
      </div>
    );
  }

  const [teamNotes, teamInfo] = await Promise.all([
    loadTeamNotes(supabase, teamId),
    getTeamInfo(teamId).catch(() => []),
  ]);

  return (
    <div>
      <BackLink href="/dashboard" label={t("navDashboard")} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{t("notesPageTitle")}</h1>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <RecentNotesPanel
          variant="page"
          teamId={teamId}
          notes={teamNotes.notes}
          players={teamNotes.players}
          playerInfo={teamNotes.playerInfo}
          clubLogo={teamInfo[0]?.team.logo ?? null}
        />
      </div>
    </div>
  );
}
