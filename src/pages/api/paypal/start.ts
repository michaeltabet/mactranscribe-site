import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/session';
import { env, envOr } from '../../../lib/env';

export const prerender = false;

/**
 * PayPal subscription alternative.
 *
 * Redirects the signed-in user to PayPal's hosted subscription page for the
 * configured plan (PAYPAL_PLAN_ID). The Keycloak subject is passed as
 * `custom_id` so the webhook can grant `pro` on activation.
 *
 * PAYPAL_ENV controls the host: "live" (default) or "sandbox".
 */
export const GET: APIRoute = async ({ cookies, redirect }) => {
  const session = await getSession(cookies);
  if (!session) return redirect('/login?returnTo=/pricing', 302);

  const planId = env('PAYPAL_PLAN_ID');
  if (!planId) return redirect('/pricing?error=paypal_unavailable', 302);

  const isSandbox = envOr('PAYPAL_ENV', 'live') === 'sandbox';
  const host = isSandbox ? 'https://www.sandbox.paypal.com' : 'https://www.paypal.com';

  // PayPal's hosted "subscribe to a plan" URL.
  const url = new URL(`${host}/webapps/billing/subscriptions`);
  url.searchParams.set('plan_id', planId);
  return redirect(url.toString(), 302);
};
