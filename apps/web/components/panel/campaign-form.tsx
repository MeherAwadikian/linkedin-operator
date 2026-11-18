'use client';

import { useState } from 'react';
import { dailyLimitWarning, type PanelAction } from '../../lib/linkedin-limits.ts';

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
  'w-full rounded-md border border-chrome-600/40 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-chrome-600 focus:border-rod-500 focus:outline-none';

/**
 * Shared hot-rod campaign form. Tracks number inputs so a value above the
 * LinkedIn daily safe limit shows an advisory warning live. The warning NEVER
 * blocks: submit stays enabled and the server action receives the values as-is.
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

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
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
              onChange={(e) =>
                setCounts((c) => ({ ...c, [f.name]: Number(e.currentTarget.value) }))
              }
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

      <button
        type="submit"
        className="self-start rounded-md bg-gradient-to-b from-rod-500 to-rod-700 px-5 py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-[0_0_18px_rgba(215,20,26,0.45)] hover:from-rod-300 hover:to-rod-600"
      >
        {submitLabel}
      </button>
    </form>
  );
}
