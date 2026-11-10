import { defaultRules } from '@lo/core';

const NAV = ['Dashboard', 'Approval Queue', 'Command Console', 'Settings'] as const;

export default function DashboardPage() {
  const rules = defaultRules();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold">LinkedIn Operator</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Phase 0 scaffold — read-only shell. No LinkedIn connection yet.
        </p>
      </header>

      <nav className="mb-10 flex flex-wrap gap-2">
        {NAV.map((item) => (
          <span
            key={item}
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            {item}
          </span>
        ))}
      </nav>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Default safety rules ({rules.length})
        </h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {rules.map((r) => (
            <li key={r.actionType} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="font-mono">{r.actionType}</span>
              <span className="text-neutral-500">
                L{r.approvalLevel} · {r.dailyLimit}/day
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
