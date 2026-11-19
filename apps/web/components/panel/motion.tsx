'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

/**
 * Shared motion primitives for the hot-rod panel. Every helper collapses to a
 * plain static render when the user prefers reduced motion, so the panel stays
 * fully usable with animations off.
 */

/** Fade-and-rise entrance for a single block. */
export function Reveal({
  delay = 0,
  children,
  ...rest
}: { delay?: number } & HTMLMotionProps<'div'>) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Parent for a staggered reveal; children must be StaggerItem. */
export function Stagger({ children, ...rest }: HTMLMotionProps<'div'>) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : 'hidden'}
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Hover-lift and press-shrink micro-interaction for cards and buttons. */
export function Pressable({ children, ...rest }: HTMLMotionProps<'div'>) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      whileHover={reduced ? undefined : { y: -3, scale: 1.015 }}
      whileTap={reduced ? undefined : { scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
