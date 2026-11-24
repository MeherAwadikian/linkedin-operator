'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy entry point for the Three.js START button so the three.js chunk never
 * blocks first paint. The loading placeholder reserves the same height and
 * shows a static button ring, so the layout does not shift when the 3D scene
 * arrives.
 */
const StartButton = dynamic(() => import('./start-button.tsx').then((m) => m.StartButton), {
  ssr: false,
  loading: () => (
    <div className="text-center" data-testid="start-button-loading">
      <div className="mx-auto flex h-[340px] w-full max-w-xl items-center justify-center">
        <div className="flex h-44 w-44 items-center justify-center rounded-full border-4 border-flame-600 bg-gradient-to-b from-flame-400 to-flame-600 shadow-[0_0_40px_rgba(255,196,0,0.35)]">
          <span className="text-2xl font-black uppercase tracking-widest text-rod-700">Start</span>
        </div>
      </div>
      <span className="mt-2 inline-block text-sm font-semibold uppercase tracking-[0.3em] text-chrome-400">
        Warming up the ignition...
      </span>
    </div>
  ),
});

export function StartButtonLazy({ action }: { action: () => Promise<void> }) {
  return <StartButton action={action} />;
}
