import { describe, expect, it } from 'vitest';
import { classifyLinkedInPage, isBlocked } from './checkpoint.ts';

describe('classifyLinkedInPage', () => {
  it('flags checkpoint/challenge/authwall URLs as blocked', () => {
    for (const url of [
      'https://www.linkedin.com/checkpoint/challenge/',
      'https://www.linkedin.com/checkpoint/lg/login-submit',
      'https://www.linkedin.com/authwall?trk=x',
    ]) {
      const c = classifyLinkedInPage({ url });
      expect(c.state, url).toBe('checkpoint');
      expect(c.blocked, url).toBe(true);
    }
  });

  it('flags CAPTCHA / human-verification body text as blocked', () => {
    const c = classifyLinkedInPage({
      url: 'https://www.linkedin.com/checkpoint/',
      bodyText: 'Please complete this security verification. Are you human?',
    });
    expect(c.blocked).toBe(true);
  });

  it('flags account-restriction markers as a checkpoint', () => {
    const c = classifyLinkedInPage({
      url: 'https://www.linkedin.com/feed/',
      bodyText: "We've restricted your account due to unusual activity.",
    });
    expect(c.state).toBe('checkpoint');
    expect(c.blocked).toBe(true);
  });

  it('treats the normal feed as not blocked', () => {
    const c = classifyLinkedInPage({ url: 'https://www.linkedin.com/feed/' });
    expect(c.state).toBe('feed');
    expect(c.blocked).toBe(false);
  });

  it('treats the sign-in page as login, not blocked', () => {
    const c = classifyLinkedInPage({ url: 'https://www.linkedin.com/login' });
    expect(c.state).toBe('login');
    expect(c.blocked).toBe(false);
  });

  it('marks unavailable pages without hard-stopping', () => {
    const c = classifyLinkedInPage({
      url: 'https://www.linkedin.com/x',
      bodyText: "This page isn't available",
    });
    expect(c.state).toBe('unavailable');
    expect(c.blocked).toBe(false);
  });

  it('defaults unknown pages to not-blocked (executor anomaly gate decides)', () => {
    expect(classifyLinkedInPage({ url: 'https://example.com/' }).state).toBe('unknown');
  });

  it('a checkpoint URL wins even if the body looks normal', () => {
    expect(
      isBlocked({ url: 'https://www.linkedin.com/checkpoint/x', bodyText: 'Welcome back' }),
    ).toBe(true);
  });
});
