"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import FixtureStatsBars from "../(app)/club/fixture/[fixtureId]/FixtureStatsBars";
import { getFixtureExternalStats, type FixtureExternalStats } from "./actions";

// The "Externa" half of the Pós-Jogo tab — same API-Football bars as
// /club/fixture/<id>, fetched once (this data doesn't change once the
// fixture's marked finished) rather than on the collective-stats poll.
export default function FixtureExternalStatsSection({ preparationKey }: { preparationKey: string }) {
  const t = useTranslations("dashboard");
  const locale = useLocale() as Locale;
  const [stats, setStats] = useState<FixtureExternalStats | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getFixtureExternalStats(preparationKey, locale).then((result) => {
      if (!cancelled) setStats(result);
    });
    return () => {
      cancelled = true;
    };
  }, [preparationKey, locale]);

  if (stats === undefined) {
    return <p className="text-sm text-muted">{t("liveStatsRecapLoading")}</p>;
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
        {t("fixtureExternalStatsNotAvailable")}
      </div>
    );
  }

  return (
    <FixtureStatsBars
      homeLogo={stats.homeLogo}
      awayLogo={stats.awayLogo}
      headline={stats.headline}
      sections={stats.sections}
    />
  );
}
