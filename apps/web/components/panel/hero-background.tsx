'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy entry point for the 3D hero backdrop. next/dynamic with ssr:false keeps
 * three.js out of the critical path entirely: the server renders nothing, the
 * static gradient below paints immediately, and the canvas fades in whenever
 * the chunk arrives. If JS fails or WebGL is unavailable, the gradient IS the
 * design (no broken state).
 */
const HeroCanvas = dynamic(() => import('./hero-canvas.tsx'), {
  ssr: false,
  loading: () => null,
});

export function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(215,20,26,0.16)_0%,transparent_55%),radial-gradient(ellipse_at_75%_70%,rgba(255,196,0,0.07)_0%,transparent_50%)]" />
      <HeroCanvas />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
    </div>
  );
}
