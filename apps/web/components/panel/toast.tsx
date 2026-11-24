'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

type Listener = (t: ToastMessage) => void;
const listeners = new Set<Listener>();
let nextId = 1;

/** Fire a toast from anywhere on the client (forms, buttons). */
export function toast(kind: ToastMessage['kind'], text: string): void {
  const msg = { id: nextId++, kind, text };
  for (const l of listeners) l(msg);
}

/**
 * Toast outlet, mounted once in the panel shell. Announces via role=status so
 * screen readers hear action feedback without focus stealing.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    const onToast: Listener = (t) => {
      setToasts((cur) => [...cur, t]);
      setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== t.id)), 4200);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 max-w-[calc(100vw-3rem)] flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-black/80 px-4 py-3 text-sm shadow-xl backdrop-blur ${
              t.kind === 'success'
                ? 'border-green-700/60 text-green-300'
                : 'border-rod-600/60 text-rod-300'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="text-neutral-100">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
