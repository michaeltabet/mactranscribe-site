import type { APIRoute } from 'astro';
import { getStripe } from '../../lib/stripe';
import { getSession } from '../../lib/session';
import { baseUrl, requireEnv } from '../../lib/env';

export const prerender = false;

/**
 * Create a Stripe subscription Checkout Session for the Pro plan.
 * - Requires a signed-in user; otherwise routes them through login first.
 * - client_reference_id is the Keycloak subject so the webhook can grant `pro`.
 */
export const POST: APIRoute = async ({ cookies, redirect }) => {
  const session = await getSession(cookies);
  if (!session) {
    // Send them to sign in, then back here to complete checkout.
    return redirect('/login?returnTo=/pricing', 302);
  }

  try {
    const stripe = getStripe();
    const priceId = requireEnv('STRIPE_PRICE_ID');
    const base = baseUrl();

    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: session.sub,
      customer_email: session.email || undefined,
      // Carry the Keycloak subject + email on the subscription for the webhook.
      subscription_data: {
        metadata: { kc_sub: session.sub, kc_email: session.email },
      },
      metadata: { kc_sub: session.sub, kc_email: session.email },
      allow_promotion_codes: true,
      success_url: `${base}/dashboard?upgraded=1`,
      cancel_url: `${base}/pricing?canceled=1`,
    });

    if (!checkout.url) {
      return new Response('Stripe did not return a checkout URL', { status: 502 });
    }
    return redirect(checkout.url, 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'checkout_failed';
    // Don't leak internals; log server-side, show a generic message.
    console.error('[checkout] error:', msg);
    return redirect('/pricing?error=checkout_unavailable', 302);
  }
};

// A GET on this route just bounces to the pricing page (e.g. someone hits the URL directly).
export const GET: APIRoute = ({ redirect }) => redirect('/pricing', 302);
