import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getLiveFeedByToken } from "../actions";
import LiveGuestView from "../LiveGuestView";

export default async function LiveGuestPage({
  params,
}: {
  params: Promise<{ locale: Locale; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const feed = await getLiveFeedByToken(token);

  if (!feed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-muted">{t("liveStatsInvalidLink")}</p>
      </div>
    );
  }

  return <LiveGuestView token={token} initialFeed={feed} />;
}
