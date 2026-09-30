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
import ChangeClubButton from "./ChangeClubButton";
import UsageSection from "./UsageSection";
import TeamCrest from "@/components/TeamCrest";
import { SectionHeading } from "../OpponentScouting";

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab: tabParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, phone, avatar_url, full_name, email, role, api_football_team_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const isCoach = profile.role === "coach";
  // "Utilização" (coach only) is its own tab so its lookups — the external
  // source's account status, database and storage sizes — only run when
  // someone actually opens it.
  const tab = isCoach && tabParam === "usage" ? "usage" : "general";

  let members: import("./MembersSection").Member[] = [];
  let pendingInvites: import("./MembersSection").PendingInvite[] = [];
  if (isCoach && tab === "general") {
    const [{ data }, { data: invites }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name, role, status").neq("id", user.id).order("created_at"),
      // Generated but not used yet (and not expired) — the link can be
      // copied again or the invite cancelled.
      supabase
        .from("invites")
        .select("id, email, role, token, expires_at")
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);
    members = data ?? [];
    pendingInvites = invites ?? [];
  }

  let currentClubName: string | null = null;
  let currentClubLogo: string | null = null;
  let currentClubCountry: string | null = null;
  let countries: Country[] = [];
  if (isCoach && tab === "general") {
    if (profile.api_football_team_id) {
      try {
        const teamInfo = await getTeamInfo(profile.api_football_team_id);
        currentClubName = teamInfo[0]?.team.name ?? null;
        currentClubLogo = teamInfo[0]?.team.logo ?? null;
        currentClubCountry = teamInfo[0]?.team.country ?? null;
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

  const roleLabel =
    profile.role === "coach" ? t("roleCoach") : profile.role === "viewer" ? t("roleViewer") : t("roleMember");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("navProfile")}</h1>

      {isCoach && (
        <nav className="-mt-2 flex gap-1 border-b border-border">
          {(
            [
              { key: "general", href: "/profile", label: t("profileTabGeneral") },
              { key: "usage", href: "/profile?tab=usage", label: t("profileTabUsage") },
            ] as const
          ).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={tab === item.key ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === item.key
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {tab === "usage" ? (
        <UsageSection supabase={supabase} locale={locale} />
      ) : (
        <>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <ProfileForm
          userId={profile.id}
          fullName={profile.full_name}
          phone={profile.phone}
          avatarUrl={profile.avatar_url}
          email={profile.email ?? user.email ?? null}
          roleLabel={roleLabel}
        />
      </section>

      {isCoach && (
        <>
          {/* The most consequential setting on the whole platform — every
              other page depends on which club is picked here — gets its
              own card instead of sharing space with unrelated settings. */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <SectionHeading icon="shield" title={t("clubSectionTitle")} />

            {currentClubName && profile.api_football_team_id ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-3 py-3">
                <Link href="/club" className="flex min-w-0 flex-1 items-center gap-3 hover:text-accent">
                  <TeamCrest logo={currentClubLogo} className="h-11 w-11" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{currentClubName}</span>
                    <span className="block text-xs font-medium text-accent">{t("goToClubButton")} →</span>
                  </span>
                </Link>
                <ChangeClubButton
                  countries={countries}
                  currentClub={{
                    id: profile.api_football_team_id,
                    name: currentClubName,
                    logo: currentClubLogo,
                    country: currentClubCountry,
                  }}
                />
              </div>
            ) : (
              <>
                {/* No club yet: the picker is the whole point of this card. */}
                <p className="mt-2 text-sm text-muted">{t("chooseClubSubtitle")}</p>
                <div className="mt-4">
                  <ClubPicker countries={countries} />
                </div>
              </>
            )}
          </section>

          {/* Invite + manage access — a distinct "administration" concern
              from the two sections above, so it gets its own boundary too;
              the two pieces inside stay divided since they're each their
              own self-contained action (invite vs. manage existing). */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <InviteForm />
            <div className="mt-6 border-t border-border pt-6">
              <MembersSection members={members} pendingInvites={pendingInvites} />
            </div>
          </section>
        </>
      )}
        </>
      )}
    </div>
  );
}
