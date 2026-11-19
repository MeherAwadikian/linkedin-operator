'use client';

import { Loader2 } from 'lucide-react';
import { useRef, useTransition } from 'react';
import { toast } from './toast.tsx';

/**
 * Thin client wrapper around a server-action form: pending state on the
 * submit button, success/error toast, optional reset after save. Children are
 * plain inputs rendered by the server component page.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  successMessage,
  resetOnSuccess = false,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  submitLabel: string;
  successMessage: string;
  resetOnSuccess?: boolean;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    startTransition(async () => {
      try {
        await action(formData);
        toast('success', successMessage);
        if (resetOnSuccess) formRef.current?.reset();
      } catch {
        toast('error', 'Save failed. Check the connection and retry.');
      }
    });
  };

  return (
    <form ref={formRef} action={submit} className={className}>
      {children}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 self-start rounded-md bg-gradient-to-b from-rod-500 to-rod-700 px-5 py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-[0_0_18px_rgba(215,20,26,0.45)] transition-shadow hover:from-rod-300 hover:to-rod-600 hover:shadow-[0_0_26px_rgba(215,20,26,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-500 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {pending ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
