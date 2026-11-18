export interface CampaignItem {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  queued?: number;
  lastError?: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'text-flame-400 border-flame-600/50',
  ready: 'text-green-400 border-green-600/50',
  done: 'text-green-400 border-green-600/50',
  failed: 'text-rod-300 border-rod-600/60',
};

/** Hot-rod themed list of a campaign table's recent rows. */
export function CampaignList({ heading, items }: { heading: string; items: CampaignItem[] }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-chrome-400">
        {heading} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-chrome-600">Nothing in the garage yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-chrome-600/30 bg-black/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-100">{c.title}</p>
                  <p className="text-xs text-chrome-600">{c.subtitle}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide ${
                    STATUS_STYLE[c.status] ?? 'border-chrome-600/40 text-chrome-400'
                  }`}
                >
                  {c.status}
                  {typeof c.queued === 'number' && c.queued > 0 ? ` · ${c.queued} queued` : ''}
                </span>
              </div>
              {c.lastError ? <p className="mt-2 text-xs text-rod-300">{c.lastError}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
