"use client";

import { useTransition } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "./actions";

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" strokeWidth={1.75}>
      <path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-4H4v4Z" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

function PreparationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" strokeWidth={1.75}>
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" />
      <path d="M8 9h8M8 13h5" stroke="currentColor" strokeLinecap="round" />
      <path d="m14.5 16 1.5 1.5L19 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" strokeWidth={1.75}>
      <path
        d="M12 3 4 6v5c0 4.6 3.2 8.5 8 10 4.8-1.5 8-5.4 8-10V6l-8-3Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" strokeWidth={1.75}>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" />
      <path d="M5 20c1.2-3.5 4-5.5 7-5.5s5.8 2 7 5.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" strokeWidth={1.75}>
      <path d="M15 4h-3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" stroke="currentColor" strokeLinecap="round" />
      <path d="M10 12h10m0 0-3-3m3 3-3 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props {
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
}

export default function DashboardSidebar({ fullName, email, avatarUrl }: Props) {
  const t = useTranslations("dashboard");
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const navItems = [
    { href: "/dashboard", label: t("navDashboard"), icon: <DashboardIcon />, exact: true },
    { href: "/dashboard/club", label: t("navClub"), icon: <ClubIcon />, exact: false },
    {
      href: "/dashboard/preparations",
      label: t("navPreparation"),
      icon: <PreparationIcon />,
      exact: false,
    },
    { href: "/dashboard/profile", label: t("navProfile"), icon: <ProfileIcon />, exact: false },
  ];

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
  }

  return (
    <>
      {/* Desktop rail */}
      <aside className="sticky top-8 hidden w-60 shrink-0 flex-col self-start border-r border-border py-8 pr-6 md:flex">
        <div className="flex items-center gap-3 pb-8">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-surface">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs text-muted">
                {(fullName || email).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{fullName || email}</div>
            <div className="truncate text-xs text-muted">{email}</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive(item.href, item.exact)
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={isPending}
          className="mt-8 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
        >
          <SignOutIcon />
          {t("signOutLabel")}
        </button>
      </aside>

      {/* Mobile top tabs — Container's edge padding is a flat px-6 at every
          size (no sm: variant), so the bleed/reveal margin has to match
          that exactly or this bar sits a few pixels short of the screen
          edge instead of flush with it. */}
      <nav className="sticky top-0 z-10 -mx-6 mb-6 flex gap-1 overflow-x-auto border-b border-border bg-background px-6 py-2 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
              isActive(item.href, item.exact)
                ? "bg-accent/10 font-medium text-accent"
                : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isPending}
          className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
        >
          <SignOutIcon />
          {t("signOutLabel")}
        </button>
      </nav>
    </>
  );
}
