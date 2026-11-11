import { signOut } from '../app/actions.ts';

const NAV = [
  { label: 'Dashboard', href: '/' },
  { label: 'Campaigns', href: '/campaigns' },
  { label: 'Email', href: '/email-campaigns' },
  { label: 'Posts', href: '/posts' },
  { label: 'Likes', href: '/likes' },
  { label: 'Approval Queue', href: '/approvals' },
  { label: 'Command Console', href: '/console' },
  { label: 'Settings', href: '/settings' },
] as const;

export function NavShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold">LinkedIn Operator</span>
            <nav className="flex gap-4">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">{email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
