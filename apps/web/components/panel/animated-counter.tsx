'use client';

import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * Animated stat number: counts up from 0 to `value` on mount, re-animates when
 * the value changes (realtime refresh), and renders the plain final value when
 * the user prefers reduced motion.
 */
export function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = String(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = String(Math.round(v));
      },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span ref={ref} className={className} aria-label={String(value)}>
      {value}
    </span>
  );
}
