/**
 * URL allowlisting for the privileged (logged-in) browser. Any URL the operator
 * navigates to MUST pass these — the browser holds the LinkedIn session, so an
 * unvalidated navigation is an SSRF / session-exfiltration risk even though only
 * the owner can enqueue jobs (RLS). Defense in depth.
 */

function host(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

/** True only for https://www.linkedin.com/in/… member-profile URLs. */
export function isLinkedInProfileUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.hostname.toLowerCase().replace(/\.$/, '') === 'www.linkedin.com' &&
    u.pathname.startsWith('/in/')
  );
}

/** True if the URL's host is linkedin.com (or a subdomain) over https. */
export function isLinkedInHost(raw: string): boolean {
  const h = host(raw);
  if (!h) return false;
  if (!raw.toLowerCase().startsWith('https:')) return false;
  return h === 'linkedin.com' || h.endsWith('.linkedin.com');
}
