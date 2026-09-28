export default function PlayerAvatar({
  photo,
  size = "h-7 w-7",
}: {
  photo: string | null;
  size?: string;
}) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" className={`${size} shrink-0 rounded-full object-cover ring-1 ring-border`} />
  ) : (
    <span className={`${size} shrink-0 rounded-full bg-border`} />
  );
}
