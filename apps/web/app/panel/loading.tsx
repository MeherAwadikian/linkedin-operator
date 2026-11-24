/**
 * Panel-wide loading skeleton: a themed shimmer instead of a blank flash while
 * server components fetch their data.
 */
export default function PanelLoading() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#3b0608_0%,#0a0a0a_55%)] text-neutral-100">
      <div className="h-1.5 bg-gradient-to-r from-rod-700 via-rod-500 to-flame-500" />
      <div className="mx-auto max-w-6xl px-6 py-10" role="status" aria-label="Loading">
        <div className="mx-auto mb-10 h-8 w-56 animate-pulse rounded-md bg-white/5" />
        <div className="mx-auto mb-12 h-44 w-44 animate-pulse rounded-full bg-flame-500/10" />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
        <div className="mt-12 h-48 animate-pulse rounded-lg bg-white/5" />
        <span className="sr-only">Loading the control panel</span>
      </div>
    </div>
  );
}
