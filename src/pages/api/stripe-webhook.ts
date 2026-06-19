import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { getStripe } from '../../lib/stripe';
import { grantProRole, revokeProRole } from '../../lib/keycloak';
import { requireEnv } from '../../lib/env';

export const prerender = false;

/**
 * Stripe webhook. Verifies the signature with STRIPE_WEBHOOK_SECRET, then:
 *   - checkout.session.completed          -> grant `pro`
 *   - customer.subscription.created/updated (active/trialing) -> grant `pro`
 *   - customer.subscription.deleted        -> revoke `pro`
 *   - customer.subscription.updated (canceled/unpaid)         -> revoke `pro`
 *
 * Role changes go through the Keycloak Admin API (see lib/keycloak.ts). The
 * Keycloak subject is carried in client_reference_id / metadata.kc_sub.
 */
export const POST: APIRoute = async ({ request }) => {
  const sig = request.headers.get('stripe-signature');
  if (!sig) return new Response('Missing stripe-signature', { status: 400 });

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const secret = requireEnv('STRIPE_WEBHOOK_SECRET');
    // Raw body is required for signature verification.
    const raw = await request.text();
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid signature';
    console.error('[stripe-webhook] signature verification failed:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (e) {
    // Return 500 so Stripe retries; log for diagnosis.
    const msg = e instanceof Error ? e.message : 'handler_error';
    console.error(`[stripe-webhook] handler error for ${event.type}:`, msg);
    return new Response('handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

function identityFromMetadata(meta: Stripe.Metadata | null | undefined, email?: string | null) {
  return {
    sub: meta?.kc_sub || undefined,
    email: meta?.kc_email || email || undefined,
  };
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);
const INACTIVE_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired']);

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const id = {
        sub: s.client_reference_id || s.metadata?.kc_sub || undefined,
        email: s.metadata?.kc_email || s.customer_details?.email || undefined,
      };
      if (id.sub || id.email) await grantProRole(id);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const id = identityFromMetadata(sub.metadata);
      if (!id.sub && !id.email) break;
      if (ACTIVE_STATUSES.has(sub.status)) {
        await grantProRole(id);
      } else if (INACTIVE_STATUSES.has(sub.status)) {
        await revokeProRole(id);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const id = identityFromMetadata(sub.metadata);
      if (id.sub || id.email) await revokeProRole(id);
      break;
    }
    default:
      // Ignore unrelated events.
      break;
  }
}
