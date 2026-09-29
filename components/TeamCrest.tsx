import Icon from "./Icon";

// A club/competition crest that may be missing — clubs and competitions
// created by hand (outside API-Football) have no logo. Renders a neutral
// shield instead of an <img> with an empty src (which makes the browser
// re-request the page).
export default function TeamCrest({
  logo,
  className = "h-6 w-6",
}: {
  logo: string | null | undefined;
  className?: string;
}) {
  if (logo) {
    // Dark theme outline for dark crests: globals.css (.dark img.object-contain).
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-background text-muted ${className}`}
    >
      <Icon name="shield" className="h-1/2 w-1/2" />
    </span>
  );
}
