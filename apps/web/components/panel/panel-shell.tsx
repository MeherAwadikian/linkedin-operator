const NAV = [
  { label: 'Dashboard', href: '/panel' },
  { label: 'Connect', href: '/panel/connect' },
  { label: 'Message', href: '/panel/message' },
  { label: 'Like', href: '/panel/like' },
  { label: 'Posts', href: '/panel/posts' },
  { label: 'Comment', href: '/panel/comment' },
  { label: 'Settings', href: '/panel/settings' },
] as const;

/**
 * Hot-rod shell for the control panel: candy-apple red over near-black, chrome
 * borders, flame-yellow accents. Deliberately always dark; the classic pages
 * keep the neutral theme and stay reachable from the top-right link.
 */
export function PanelShell({
  email,
  active,
  children,
}: {
  email: string;
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#3b0608_0%,#0a0a0a_55%)] text-neutral-100">
      <div className="h-1.5 bg-gradient-to-r from-rod-700 via-rod-500 to-flame-500" />
      <header className="border-b border-rod-800/60 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <a href="/panel" className="flex items-baseline gap-2">
              <span className="text-lg font-black uppercase italic tracking-widest text-rod-500">
                Hot Rod
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-chrome-400">
                Control Panel
              </span>
            </a>
            <nav className="flex flex-wrap gap-1">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={
                    item.href === active
                      ? 'rounded-md bg-rod-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_14px_rgba(215,20,26,0.5)]'
                      : 'rounded-md px-3 py-1.5 text-sm text-chrome-400 hover:bg-rod-900/60 hover:text-white'
                  }
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-chrome-600">{email}</span>
            <a
              href="/"
              className="rounded-md border border-chrome-600/40 px-3 py-1.5 text-xs text-chrome-400 hover:border-chrome-400 hover:text-white"
            >
              Classic UI
            </a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      <footer className="mx-auto max-w-6xl px-6 pb-8">
        <div className="h-px bg-gradient-to-r from-transparent via-rod-700 to-transparent" />
        <p className="pt-3 text-center text-[11px] uppercase tracking-[0.25em] text-chrome-600">
          Every write action waits in the Approval Queue. Drive it like you own it.
        </p>
      </footer>
    </div>
  );
}
