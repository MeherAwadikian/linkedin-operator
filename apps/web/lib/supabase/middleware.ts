import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Read a runtime var/secret. OpenNext does not reliably populate process.env in
 * middleware, so prefer the Cloudflare binding and fall back to process.env. */
function runtimeEnv(key: string): string | undefined {
  try {
    const v = (getCloudflareContext().env as Record<string, unknown>)[key];
    if (typeof v === 'string' && v) return v;
  } catch {
    // getCloudflareContext unavailable in this context — fall through.
  }
  return process.env[key];
}

/** Default ceiling for a single auth round-trip. Normal calls finish in well
 * under a second; this only trips when the database is unreachable or stalled. */
const DEFAULT_AUTH_TIMEOUT_MS = 5000;

function authTimeoutMs(): number {
  const raw = runtimeEnv('AUTH_TIMEOUT_MS');
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_AUTH_TIMEOUT_MS;
}

/** Resolve to the promise's value, or to the sentinel if it does not settle in
 * time. Prevents a stalled Supabase/Postgres from blocking the request for the
 * platform's full timeout: an auth round-trip that hangs degrades to "no session"
 * fast instead of freezing every page for 30-60s. */
async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Refreshes the Supabase session on every request. In no-login mode it also
 * auto-signs-in the fixed operator when there is no session, so the app opens
 * straight to the dashboard. Must run in middleware so the auth cookie is
 * written to the response.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates with the auth server; do not use getSession
  // here (it trusts the cookie without verification). Bounded by a timeout so a
  // stalled database degrades to "no session" instead of hanging the request.
  const timeoutMs = authTimeoutMs();
  const getUserResult = await withTimeout(supabase.auth.getUser(), timeoutMs, null);
  if (getUserResult === null) {
    // Auth round-trip timed out (database unreachable). Serve the request without
    // a session rather than blocking; skip auto-login, which would also hang.
    return response;
  }
  const {
    data: { user },
  } = getUserResult;

  // No-login mode: the app is a single open operator console. When there is no
  // session, sign in automatically as the fixed operator (credentials from env).
  // signInWithPassword writes the auth cookies to `response` via setAll; we then
  // redirect to the same path carrying those cookies, so the follow-up request is
  // authenticated and the page renders. There is no login screen — anyone who can
  // reach the URL is the operator.
  if (!user) {
    const email = runtimeEnv('OPERATOR_EMAIL');
    const password = runtimeEnv('OPERATOR_PASSWORD');
    if (email && password) {
      const signIn = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        timeoutMs,
        null,
      );
      // null = sign-in timed out (database stalled); fall through to the plain
      // response instead of hanging.
      if (signIn && !signIn.error) {
        const dest = request.nextUrl.clone();
        if (dest.pathname.startsWith('/login')) dest.pathname = '/';
        const redirect = NextResponse.redirect(dest);
        for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
        return redirect;
      }
    }
  }

  return response;
}
