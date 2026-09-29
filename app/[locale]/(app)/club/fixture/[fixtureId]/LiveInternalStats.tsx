import type { Locale } from "@/i18n/routing";
import type { LoadedLiveFixture } from "@/lib/liveFixtureLoader";
import { emptyGkStatsSide } from "../../../../live/liveStatsShared";
import GkStatsPanel from "../../../../live/GkStatsPanel";
import { activeCollectiveFields, fieldLabel } from "../../../../live/liveStatConfig";
import FixtureStatsBars from "./FixtureStatsBars";
import { buildFixtureStatSections } from "./fixtureStatsHelpers";

// The "Interna" side of a match page's stats: the ASM Live Mode numbers in
// the same bars as API-Football's, plus our goalkeeper's actions.
export default function LiveInternalStats({
  live,
  ourSide,
  ourTeamName,
  homeLogo,
  awayLogo,
  locale,
  sectionTitle,
}: {
  live: LoadedLiveFixture;
  ourSide: "home" | "away";
  ourTeamName: string;
  homeLogo: string;
  awayLogo: string;
  locale: Locale;
  sectionTitle: (titleKey: string) => string;
}) {
  const { headline, sections } = buildFixtureStatSections(
    live.view.statistics.home,
    live.view.statistics.away,
    locale,
    sectionTitle,
    Object.fromEntries(
      activeCollectiveFields(live.statConfig).map((f) => [`live_${f.key}`, fieldLabel(f, sectionTitle)]),
    ),
  );
  const keepers = ourSide === "home" ? live.gkStats.homeByPlayer : live.gkStats.awayByPlayer;

  return (
    <>
      <FixtureStatsBars homeLogo={homeLogo} awayLogo={awayLogo} headline={headline} sections={sections} />
      {keepers.length > 0 && (
        <div className="mt-8 border-t border-border pt-6">
          <GkStatsPanel
            stats={keepers[0]?.stats ?? emptyGkStatsSide()}
            incompleteStats={keepers[0]?.incomplete}
            gkName={keepers[0]?.name ?? null}
            teamName={ourTeamName}
            players={live.ourLineupPlayers}
            canEdit={false}
            byPlayer={keepers}
            statConfig={live.statConfig}
          />
        </div>
      )}
    </>
  );
}
