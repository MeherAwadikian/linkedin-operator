/**
 * LinkedIn page classifier — the input to the worker's hard-stop policy (plan
 * §5, §6). Given the current URL and (optionally) the page title/body text, it
 * identifies KNOWN checkpoint/CAPTCHA/restriction states. When `blocked` is
 * true the worker must halt the queue, mark the account `checkpoint`, surface
 * it, and wait for the human — it must NEVER try to solve or bypass the page.
 *
 * Pure and dependency-free so it is fully unit-tested without a browser. This
 * does not attempt to defeat detection; it recognizes when LinkedIn has stopped
 * us so we can stop too.
 */

export type PageState =
  | 'feed' // logged-in, normal
  | 'login' // pre-auth sign-in page (expected)
  | 'checkpoint' // verification / challenge / auth wall / restriction
  | 'captcha' // a CAPTCHA / "are you human" gate
  | 'unavailable' // page not available / error shell
  | 'unknown';

export interface PageSignal {
  url: string;
  title?: string;
  bodyText?: string;
}

export interface PageClassification {
  state: PageState;
  /** True → the worker must hard-stop and hand off to the human. */
  blocked: boolean;
  reason: string;
}

const URL_CHECKPOINT = /\/checkpoint\/|\/authwall|\/challenge/i;
const URL_LOGIN = /\/uas\/login|\/login(\b|\/|\?|$)|\/signup/i;
const URL_FEED = /\/feed(\b|\/|\?|$)|\/in\/|\/mynetwork|\/messaging/i;

const BODY_CAPTCHA =
  /captcha|recaptcha|hcaptcha|px-captcha|are you (a )?human|verify (that )?you(['’]| a)?re (a )?human|security verification/i;
const BODY_RESTRICTION =
  /unusual activity|we['’]?ve restricted|restricted your account|couldn['’]?t verify|verify your identity|complete (this|a) security check|confirm it['’]?s you/i;
const BODY_UNAVAILABLE = /this page isn['’]?t available|page not found|HTTP ERROR 999/i;

/** Classify a page. Checked most-dangerous-first so a checkpoint always wins. */
export function classifyLinkedInPage(signal: PageSignal): PageClassification {
  const url = signal.url ?? '';
  const text = `${signal.title ?? ''}\n${signal.bodyText ?? ''}`;

  if (URL_CHECKPOINT.test(url)) {
    return { state: 'checkpoint', blocked: true, reason: 'checkpoint/authwall URL' };
  }
  if (BODY_CAPTCHA.test(text)) {
    return { state: 'captcha', blocked: true, reason: 'CAPTCHA / human-verification markers' };
  }
  if (BODY_RESTRICTION.test(text)) {
    return {
      state: 'checkpoint',
      blocked: true,
      reason: 'account-restriction / verify-identity markers',
    };
  }
  if (BODY_UNAVAILABLE.test(text)) {
    return { state: 'unavailable', blocked: false, reason: 'page unavailable' };
  }
  if (URL_FEED.test(url)) {
    return { state: 'feed', blocked: false, reason: 'logged-in feed/profile/messaging' };
  }
  if (URL_LOGIN.test(url)) {
    return { state: 'login', blocked: false, reason: 'pre-auth sign-in page' };
  }
  return { state: 'unknown', blocked: false, reason: 'unrecognized page' };
}

/** Convenience guard for the executor's stop-on-anomaly gate. */
export function isBlocked(signal: PageSignal): boolean {
  return classifyLinkedInPage(signal).blocked;
}
