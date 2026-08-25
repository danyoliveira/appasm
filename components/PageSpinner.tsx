// Next.js swaps this in automatically (via each route's loading.tsx) while
// that route's Server Component is still awaiting data — most pages here
// make many API-Football/Supabase calls before they can render anything,
// so without this the browser just sits frozen on the previous screen.
export default function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div
        role="status"
        aria-label="A carregar"
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
      />
    </div>
  );
}
