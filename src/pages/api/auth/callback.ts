import type { APIRoute } from 'astro';
import { exchangeCode, verifyIdToken } from '../../../lib/oidc';
import { getFlowCookie, clearFlowCookie, setSessionCookie } from '../../../lib/session';
import { baseUrl } from '../../../lib/env';

export const prerender = false;

/**
 * OIDC redirect target. Validates state, exchanges the code (with the PKCE
 * verifier), verifies the ID token, then sets a signed httpOnly session cookie.
 */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const fail = (reason: string) => {
    clearFlowCookie(cookies);
    return redirect(`/login?error=${encodeURIComponent(reason)}`, 302);
  };

  try {
    const err = url.searchParams.get('error');
    if (err) return fail(err);

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return fail('missing_code_or_state');

    const flow = await getFlowCookie(cookies);
    if (!flow) return fail('expired_session');
    if (flow.state !== state) return fail('state_mismatch');

    const redirectUri = `${baseUrl()}/api/auth/callback`;
    const tokens = await exchangeCode({
      code,
      redirectUri,
      codeVerifier: flow.codeVerifier,
    });

    const id = await verifyIdToken(tokens.id_token, flow.nonce || undefined);

    await setSessionCookie(cookies, {
      sub: id.sub,
      email: id.email,
      name: id.name,
      isPro: id.isPro,
      idToken: tokens.id_token,
    });
    clearFlowCookie(cookies);

    const dest = flow.returnTo.startsWith('/') && !flow.returnTo.startsWith('//') ? flow.returnTo : '/dashboard';
    return redirect(dest, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'callback_failed';
    return fail(msg);
  }
};
