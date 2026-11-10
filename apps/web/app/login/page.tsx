import { signIn } from './actions.ts';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">LinkedIn Operator</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">Sign in to continue.</p>

      {error ? (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <form action={signIn} className="flex flex-col gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-600 dark:text-neutral-400">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-xs text-neutral-500">
        Single-operator app. Create your user in the Supabase dashboard; public sign-ups are
        disabled.
      </p>
    </main>
  );
}
