// Next.js swaps this in automatically (via each route's loading.tsx) while
// that route's Server Component is still awaiting data — most pages here
// make many API-Football/Supabase calls before they can render anything.
// A page-shaped skeleton (title, a hero card, content cards) instead of a
// lone spinner, so the switch reads as "the page is coming" right away.
export default function PageSpinner() {
  const block = "rounded-2xl border border-border bg-surface";
  const line = "rounded-md bg-border/70";
  return (
    <div role="status" aria-label="A carregar" className="animate-pulse space-y-6">
      <div className={`h-7 w-48 ${line}`} />
      <div className={`${block} flex items-center gap-4 p-6`}>
        <div className="h-16 w-16 shrink-0 rounded-2xl bg-border/70" />
        <div className="flex-1 space-y-2.5">
          <div className={`h-3 w-32 ${line}`} />
          <div className={`h-6 w-56 max-w-full ${line}`} />
          <div className={`h-3 w-40 ${line}`} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={`${block} space-y-3 p-6`}>
            <div className={`h-4 w-36 ${line}`} />
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className={`h-10 ${line}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
