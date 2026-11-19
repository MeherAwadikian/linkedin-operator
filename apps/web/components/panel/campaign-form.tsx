'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, Rocket } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { dailyLimitWarning, type PanelAction } from '../../lib/linkedin-limits.ts';
import { toast } from './toast.tsx';

export interface FieldSpec {
  name: string;
  label: string;
  kind: 'text' | 'textarea' | 'number';
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  defaultValue?: string | number;
  help?: string;
  /** Number fields only: which daily safe limit this count is checked against. */
  limitAction?: PanelAction;
}

const field =
  'w-full rounded-md border border-chrome-600/40 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-chrome-600 transition-colors focus:border-rod-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rod-500/40';

/**
 * Shared hot-rod campaign form. Tracks number inputs so a value above the
 * LinkedIn daily safe limit shows an advisory warning live. The warning NEVER
 * blocks: submit stays enabled and the server action receives the values as-is.
 * Submission runs the passed server action, shows a pending state, fires a
 * toast on completion, and resets the form for the next campaign.
 */
export function CampaignForm({
  action,
  fields,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: FieldSpec[];
  submitLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const reduced = useReducedMotion();
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const f of fields) {
      if (f.kind === 'number') init[f.name] = Number(f.defaultValue ?? f.min ?? 1);
    }
    return init;
  });

  const warnings = fields
    .filter((f) => f.kind === 'number' && f.limitAction)
    .map((f) => dailyLimitWarning(f.limitAction as PanelAction, counts[f.name] ?? 0))
    .filter((w): w is string => Boolean(w));

  const submit = (formData: FormData) => {
    startTransition(async () => {
      try {
        await action(formData);
        toast('success', 'Campaign staged. Push START on the dashboard to launch.');
        formRef.current?.reset();
      } catch {
        toast('error', 'Could not stage the campaign. Check the connection and retry.');
      }
    });
  };

  return (
    <form ref={formRef} action={submit} className="flex max-w-xl flex-col gap-4">
      {fields.map((f) => (
        <label key={f.name} className="text-sm">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-chrome-400">
            {f.label}
          </span>
          {f.kind === 'textarea' ? (
            <textarea
              name={f.name}
              rows={3}
              required={f.required}
              placeholder={f.placeholder}
              defaultValue={f.defaultValue as string | undefined}
              className={`${field} font-sans`}
            />
          ) : f.kind === 'number' ? (
            <input
              type="number"
              name={f.name}
              required={f.required}
              min={f.min}
              max={f.max}
              defaultValue={f.defaultValue}
              onChange={(e) => {
                // Read the value NOW: currentTarget is nulled once the event
                // finishes, and the state updater can run after that.
                const value = Number(e.currentTarget.value);
                setCounts((c) => ({ ...c, [f.name]: value }));
              }}
              className={`${field} w-36`}
            />
          ) : (
            <input
              type="text"
              name={f.name}
              required={f.required}
              placeholder={f.placeholder}
              defaultValue={f.defaultValue as string | undefined}
              className={field}
            />
          )}
          {f.help ? <span className="mt-1 block text-xs text-chrome-600">{f.help}</span> : null}
        </label>
      ))}

      {warnings.map((w) => (
        <p
          key={w}
          role="status"
          className="rounded-md border border-flame-600/60 bg-flame-500/10 px-3 py-2 text-sm text-flame-400"
        >
          <span className="mr-1 font-bold uppercase">Redline warning:</span>
          {w}
        </p>
      ))}

      <motion.button
        type="submit"
        disabled={pending}
        whileHover={reduced || pending ? undefined : { scale: 1.03 }}
        whileTap={reduced || pending ? undefined : { scale: 0.97 }}
        className="inline-flex items-center gap-2 self-start rounded-md bg-gradient-to-b from-rod-500 to-rod-700 px-5 py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-[0_0_18px_rgba(215,20,26,0.45)] transition-shadow hover:from-rod-300 hover:to-rod-600 hover:shadow-[0_0_26px_rgba(215,20,26,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-500 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Rocket className="h-4 w-4" aria-hidden="true" />
        )}
        {pending ? 'Staging...' : submitLabel}
      </motion.button>
    </form>
  );
}
