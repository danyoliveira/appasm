import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamInfo, getCountries } from "@/lib/api-football/cache";
import type { Country } from "@/lib/api-football/client";
import ProfileForm from "./ProfileForm";
import InviteForm from "./InviteForm";
import MembersSection from "./MembersSection";
import ClubPicker from "./ClubPicker";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, phone, avatar_url, full_name, role, api_football_team_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const isCoach = profile.role === "coach";

  let members: import("./MembersSection").Member[] = [];
  if (isCoach) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status")
      .neq("id", user.id)
      .order("created_at");
    members = data ?? [];
  }

  let currentClubName: string | null = null;
  let currentClubLogo: string | null = null;
  let countries: Country[] = [];
  if (isCoach) {
    if (profile.api_football_team_id) {
      try {
        const teamInfo = await getTeamInfo(profile.api_football_team_id);
        currentClubName = teamInfo[0]?.team.name ?? null;
        currentClubLogo = teamInfo[0]?.team.logo ?? null;
      } catch {
        // Club section still renders, just without the current-club preview.
      }
    }
    try {
      countries = await getCountries();
    } catch {
      // ClubPicker just gets an empty list; the coach can retry later.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <ProfileForm
          userId={profile.id}
          fullName={profile.full_name}
          phone={profile.phone}
          avatarUrl={profile.avatar_url}
        />
      </section>

      {isCoach && (
        <>
          {/* The most consequential setting on the whole platform — every
              other page depends on which club is picked here — gets its
              own card instead of sharing space with unrelated settings. */}
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">{t("clubSectionTitle")}</h2>

            {currentClubName && (
              <Link href="/dashboard/club" className="mt-4 flex items-center gap-3 hover:text-accent">
                {currentClubLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentClubLogo} alt="" className="h-10 w-10 object-contain" />
                )}
                <div className="font-medium">{currentClubName}</div>
              </Link>
            )}

            {!currentClubName && (
              <p className="mt-1 text-sm text-muted">{t("chooseClubSubtitle")}</p>
            )}

            <details className="mt-4" open={!currentClubName}>
              <summary className="cursor-pointer text-sm font-medium text-accent hover:underline">
                {currentClubName ? t("changeClubButton") : t("chooseClubTitle")}
              </summary>
              <div className="mt-3">
                <ClubPicker countries={countries} />
              </div>
            </details>
          </section>

          {/* Invite + manage access — a distinct "administration" concern
              from the two sections above, so it gets its own boundary too;
              the two pieces inside stay divided since they're each their
              own self-contained action (invite vs. manage existing). */}
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <InviteForm />
            <div className="mt-6 border-t border-border pt-6">
              <MembersSection members={members} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
