import type { APIRoute } from 'astro';
import { buildAuthUrl, makeCodeVerifier, codeChallengeS256, randomToken } from '../../../lib/oidc';
import { setFlowCookie } from '../../../lib/session';
import { baseUrl } from '../../../lib/env';

export const prerender = false;

/**
 * Begin the OIDC Authorization Code + PKCE flow.
 * Query params:
 *   idp=google   -> passes kc_idp_hint=google so Keycloak bounces straight to Google
 *   returnTo=/x  -> where to land after a successful login (defaults to /dashboard)
 */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  try {
    const idp = url.searchParams.get('idp') || undefined;
    const rawReturn = url.searchParams.get('returnTo') || '/dashboard';
    // Only allow same-site relative paths as the return target.
    const returnTo = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/dashboard';

    const redirectUri = `${baseUrl()}/api/auth/callback`;
    const state = randomToken();
    const nonce = randomToken();
    const codeVerifier = makeCodeVerifier();
    const codeChallenge = await codeChallengeS256(codeVerifier);

    await setFlowCookie(cookies, { state, nonce, codeVerifier, returnTo });

    const authUrl = await buildAuthUrl({
      redirectUri,
      state,
      nonce,
      codeChallenge,
      idpHint: idp === 'google' ? 'google' : undefined,
    });
    return redirect(authUrl, 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'login_init_failed';
    return redirect(`/login?error=${encodeURIComponent(msg)}`, 302);
  }
};
