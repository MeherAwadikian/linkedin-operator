'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * Route transition for every /panel page. A template remounts on navigation,
 * so a mount animation here gives a smooth cross-page fade/rise without any
 * router instrumentation. Static under prefers-reduced-motion.
 */
export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
