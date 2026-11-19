'use client';

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useRef } from 'react';

/**
 * 3D perspective tilt card: the surface tilts toward the pointer with a
 * springy glare sweep, the second 3D accent next to the START button scene.
 * Pure CSS 3D transforms (no WebGL cost) driven by framer-motion springs.
 * Keyboard and reduced-motion users get a plain static card.
 */
export function TiltCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 260, damping: 24 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-7, 7]), { stiffness: 260, damping: 24 });
  const glareX = useTransform(px, [0, 1], ['20%', '80%']);
  const glare = useTransform(
    glareX,
    (x) => `radial-gradient(circle at ${x} 20%, rgba(255,255,255,0.08) 0%, transparent 60%)`,
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div style={{ perspective: 900 }}>
      <motion.div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className={`relative ${className ?? ''}`}
      >
        {children}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 hover:opacity-100"
          style={{ background: glare }}
        />
      </motion.div>
    </div>
  );
}
