import { describe, expect, it } from 'vitest';
import { isLinkedInHost, isLinkedInProfileUrl } from './url.ts';

describe('isLinkedInProfileUrl', () => {
  it('accepts a canonical https profile URL', () => {
    expect(isLinkedInProfileUrl('https://www.linkedin.com/in/meher-awadikian-5849913b9/')).toBe(
      true,
    );
  });

  it('rejects non-https, wrong host, host-spoofs, and non-/in paths', () => {
    for (const bad of [
      'http://www.linkedin.com/in/x', // not https
      'https://linkedin.com/in/x', // not www
      'https://www.linkedin.com.evil.com/in/x', // suffix host spoof
      'https://evil.com/in/x', // wrong host
      'https://www.linkedin.com/feed/', // not a profile
      'https://www.linkedin.com/company/x', // not /in/
      'file:///etc/passwd',
      'not a url',
      'https://user@www.linkedin.com.attacker.test/in/x',
    ]) {
      expect(isLinkedInProfileUrl(bad), bad).toBe(false);
    }
  });
});

describe('isLinkedInHost', () => {
  it('accepts linkedin.com and subdomains over https', () => {
    expect(isLinkedInHost('https://www.linkedin.com/feed/')).toBe(true);
    expect(isLinkedInHost('https://linkedin.com/')).toBe(true);
  });
  it('rejects spoofs and non-https', () => {
    expect(isLinkedInHost('https://www.linkedin.com.evil.com/')).toBe(false);
    expect(isLinkedInHost('http://www.linkedin.com/')).toBe(false);
  });
});
