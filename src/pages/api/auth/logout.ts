import type { APIRoute } from 'astro';
import { getSession, clearSessionCookie } from '../../../lib/session';
import { buildLogoutUrl } from '../../../lib/oidc';
import { baseUrl, hasEnv } from '../../../lib/env';

export const prerender = false;

/**
 * Clear the local session and (if Keycloak is configured) redirect through the
 * realm's end-session endpoint so the IdP session is closed too.
 */
export const GET: APIRoute = async ({ cookies, redirect }) => {
  const session = await getSession(cookies);
  clearSessionCookie(cookies);

  const postLogoutRedirectUri = `${baseUrl()}/`;

  // If Keycloak isn't configured at runtime, just clear locally and go home.
  if (!hasEnv('KEYCLOAK_ISSUER')) {
    return redirect('/', 302);
  }

  try {
    const logoutUrl = await buildLogoutUrl({
      idTokenHint: session?.idToken,
      postLogoutRedirectUri,
    });
    return redirect(logoutUrl, 302);
  } catch {
    // Even if discovery fails, the local cookie is already gone.
    return redirect('/', 302);
  }
};
