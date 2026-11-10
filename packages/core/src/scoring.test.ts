import { describe, expect, it } from 'vitest';
import { scoreJob, type ScoringProfile } from './scoring.ts';

const AI_PROFILE: ScoringProfile = {
  skill_angles: [
    {
      id: 'ai_automation',
      label: 'AI / Automation',
      keywords: ['AI agents', 'automation', 'n8n', 'Python', 'Claude', 'workflow automation'],
      weight: 1.0,
    },
  ],
  location: { country: 'Lebanon' },
};

describe('scoreJob', () => {
  it('scores a strong, remote, fresh AI job as expected (locks ported behavior)', () => {
    const postedAt = '2026-11-10T00:00:00Z';
    const now = Date.parse('2026-11-10T06:00:00Z'); // 0.25 days old
    const result = scoreJob(
      {
        title: 'AI Automation Engineer',
        description: 'Build AI agents and workflow automation with Python and Claude',
        remote: true,
        posted_at: postedAt,
      },
      AI_PROFILE,
      now,
    );
    expect(result.breakdown).toHaveLength(6);
    expect(result.breakdown.find((p) => p.key === 'skills_match')!.score).toBe(60);
    expect(result.breakdown.find((p) => p.key === 'location_remote_compat')!.score).toBe(100);
    expect(result.breakdown.find((p) => p.key === 'freshness')!.score).toBe(100);
    expect(result.total).toBe(73);
    expect(result.grade).toBe('Good');
  });

  it('clamps and grades a weak on-site stale job as low priority', () => {
    const now = Date.parse('2026-11-10T00:00:00Z');
    const result = scoreJob(
      {
        title: 'Warehouse Picker',
        description: 'Manual labor, no remote',
        location: 'Berlin, Germany',
        posted_at: '2026-09-01T00:00:00Z', // ~70 days
      },
      AI_PROFILE,
      now,
    );
    expect(result.total).toBeLessThan(60);
    expect(result.grade).toBe('Low priority');
    expect(result.breakdown.find((p) => p.key === 'location_remote_compat')!.score).toBe(20);
    expect(result.breakdown.find((p) => p.key === 'freshness')!.score).toBe(15);
  });

  it('rewards an on-site job in the candidate country', () => {
    const r = scoreJob({ title: 'x', location: 'Beirut, Lebanon' }, AI_PROFILE, Date.now());
    expect(r.breakdown.find((p) => p.key === 'location_remote_compat')!.score).toBe(90);
  });

  it('respects the salary floor', () => {
    const profile: ScoringProfile = { ...AI_PROFILE, preferences: { min_salary_usd_month: 1500 } };
    const below = scoreJob({ title: 'x', salary_max: 800 }, profile, Date.now());
    const above = scoreJob({ title: 'x', salary_max: 3000 }, profile, Date.now());
    expect(below.breakdown.find((p) => p.key === 'salary_compat')!.score).toBe(30);
    expect(above.breakdown.find((p) => p.key === 'salary_compat')!.score).toBe(100);
  });

  it('treats a large salary figure as annual (÷12 heuristic)', () => {
    const profile: ScoringProfile = { ...AI_PROFILE, preferences: { min_salary_usd_month: 1500 } };
    const annual = scoreJob({ title: 'x', salary_max: 60000 }, profile, Date.now());
    expect(annual.breakdown.find((p) => p.key === 'salary_compat')!.score).toBe(100); // 60000/12=5000
  });
});
