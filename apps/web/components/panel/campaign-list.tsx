'use client';

import { Warehouse } from 'lucide-react';
import { Stagger, StaggerItem } from './motion.tsx';

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
    <section className="mt-10" data-testid="campaign-list">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-chrome-400">
        {heading} ({items.length})
      </h2>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-chrome-600/30 bg-black/20 px-4 py-8 text-center">
          <Warehouse className="mx-auto mb-2 h-5 w-5 text-chrome-600" aria-hidden="true" />
          <p className="text-sm text-chrome-600">
            Nothing in the garage yet. Stage one with the form above.
          </p>
        </div>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {items.map((c) => (
            <StaggerItem key={c.id}>
              <div className="rounded-lg border border-chrome-600/30 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur transition-colors hover:border-chrome-600/60">
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
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}
