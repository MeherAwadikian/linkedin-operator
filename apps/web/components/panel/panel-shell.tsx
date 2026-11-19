'use client';

import {
  Flame,
  Gauge,
  Heart,
  MessageSquareText,
  Newspaper,
  Send,
  Settings,
  UserPlus,
} from 'lucide-react';
import { Toaster } from './toast.tsx';

const NAV = [
  { label: 'Dashboard', href: '/panel', icon: Gauge },
  { label: 'Connect', href: '/panel/connect', icon: UserPlus },
  { label: 'Message', href: '/panel/message', icon: Send },
  { label: 'Like', href: '/panel/like', icon: Heart },
  { label: 'Posts', href: '/panel/posts', icon: Newspaper },
  { label: 'Comment', href: '/panel/comment', icon: MessageSquareText },
  { label: 'Settings', href: '/panel/settings', icon: Settings },
] as const;

/**
 * Hot-rod shell for the control panel: candy-apple red over near-black, chrome
 * borders, flame-yellow accents, glassmorphism header. Deliberately always
 * dark; the classic pages keep the neutral theme.
 */
export function PanelShell({
  active,
  children,
}: {
  // email is still accepted from the pages but no longer shown in the header.
  email?: string;
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#3b0608_0%,#0a0a0a_55%)] text-neutral-100">
      <a
        href="#panel-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-rod-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <div className="h-1.5 bg-gradient-to-r from-rod-700 via-rod-500 to-flame-500" />
      <header className="sticky top-0 z-40 border-b border-rod-800/60 bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <a href="/panel" className="group flex items-baseline gap-2">
              <Flame
                className="h-4 w-4 self-center text-flame-500 transition-transform group-hover:scale-110"
                aria-hidden="true"
              />
              <span className="text-lg font-black uppercase italic tracking-widest text-rod-500">
                Hot Rod
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-chrome-400">
                Control Panel
              </span>
            </a>
            <nav aria-label="Panel" className="flex flex-wrap gap-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                const current = item.href === active;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={
                      current
                        ? 'flex items-center gap-1.5 rounded-md bg-rod-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_14px_rgba(215,20,26,0.5)]'
                        : 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-chrome-400 transition-colors hover:bg-rod-900/60 hover:text-white'
                    }
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.label}
                  </a>
                );
              })}
            </nav>
          </div>
        </div>
      </header>
      <main id="panel-main" className="mx-auto max-w-6xl px-6 py-10">
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-6 pb-8">
        <div className="h-px bg-gradient-to-r from-transparent via-rod-700 to-transparent" />
        <p className="pt-3 text-center text-[11px] uppercase tracking-[0.25em] text-chrome-600">
          Every write action waits in the Approval Queue. Drive it like you own it.
        </p>
      </footer>
      <Toaster />
    </div>
  );
}
