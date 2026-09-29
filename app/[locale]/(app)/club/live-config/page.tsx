import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { loadTeamStatConfig } from "@/lib/liveStatConfigServer";
import BackLink from "../../BackLink";
import LiveStatConfigEditor from "./LiveStatConfigEditor";

// Meu Clube › Estatística › ASM Live Mode › "Configurar campos" — the
// coach sets which collective counters and goalkeeper actions (and groups)
// the club's Live Mode uses.
export default async function LiveConfigPage({ params }: { params: Promise<{ locale: Locale }> }) {
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

  return (
    <div>
      <BackLink href="/club" label={t("clubSectionTitle")} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{t("liveConfigTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t("liveConfigSubtitle")}</p>

      <div className="mt-6">
        {profile?.role !== "coach" || !teamId ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
            {t("liveConfigCoachOnly")}
          </p>
        ) : (
          <LiveStatConfigEditor initialConfig={await loadTeamStatConfig(supabase, teamId)} />
        )}
      </div>
    </div>
  );
}
