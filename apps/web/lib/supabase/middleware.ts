import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
  // here (it trusts the cookie without verification).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No-login mode: the app is a single open operator console. When there is no
  // session, sign in automatically as the fixed operator (credentials from env).
  // signInWithPassword writes the auth cookies to `response` via setAll; we then
  // redirect to the same path carrying those cookies, so the follow-up request is
  // authenticated and the page renders. There is no login screen — anyone who can
  // reach the URL is the operator.
  if (!user) {
    const email = process.env.OPERATOR_EMAIL;
    const password = process.env.OPERATOR_PASSWORD;
    if (email && password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) {
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
