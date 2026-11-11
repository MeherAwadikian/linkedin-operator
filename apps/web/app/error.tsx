'use client';

import { useEffect } from 'react';

/**
 * App-wide error boundary. The most common error here is a stale "Server Action
 * not found" right after a redeploy (the open tab's bundle predates the new
 * deploy). A full reload fetches a matching bundle, so we offer that prominently
 * instead of showing Next.js's raw error screen.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('app error boundary:', error);
  }, [error]);

  const stale = /server action|failed to find server action|unrecognizedaction/i.test(
    error?.message ?? '',
  );

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-24">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-neutral-500">
        {stale
          ? 'The app was updated while this tab was open. Reload to get the latest version.'
          : 'An unexpected error occurred. Reloading usually fixes it.'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
