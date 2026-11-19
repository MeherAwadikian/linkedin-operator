'use client';

import { RefreshCcw, TriangleAlert } from 'lucide-react';

/**
 * Panel-scoped error boundary in the hot-rod theme. Keeps the operator inside
 * the panel with a one-click retry instead of falling back to the root error
 * page's neutral styling.
 */
export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#3b0608_0%,#0a0a0a_55%)] px-6 text-center text-neutral-100">
      <TriangleAlert className="mb-4 h-10 w-10 text-flame-500" aria-hidden="true" />
      <h1 className="text-2xl font-black uppercase italic tracking-widest text-rod-500">
        Engine stalled
      </h1>
      <p className="mt-3 max-w-md text-sm text-chrome-400">
        Something broke while loading this page. Your campaigns and the Approval Queue are safe;
        nothing was sent.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-gradient-to-b from-rod-500 to-rod-700 px-5 py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-[0_0_18px_rgba(215,20,26,0.45)] hover:from-rod-300 hover:to-rod-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-500"
      >
        <RefreshCcw className="h-4 w-4" aria-hidden="true" />
        Restart the engine
      </button>
    </div>
  );
}
