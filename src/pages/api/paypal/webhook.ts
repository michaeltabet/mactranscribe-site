import type { APIRoute } from 'astro';
import { grantProRole, revokeProRole } from '../../../lib/keycloak';
import { env } from '../../../lib/env';

export const prerender = false;

/**
 * PayPal subscription webhook (STUB).
 *
 * This parses the event and, on subscription activation, grants `pro`; on
 * cancellation/expiry it revokes `pro`. The Keycloak subject is read from the
 * subscription's `custom_id`.
 *
 * TODO (production hardening): verify the webhook signature via PayPal's
 * `/v1/notifications/verify-webhook-signature` endpoint using PAYPAL_WEBHOOK_ID
 * + the transmission headers BEFORE trusting the payload. Until that is wired,
 * this route only acts when PAYPAL_WEBHOOK_ID is set, and otherwise no-ops with
 * a 200 so PayPal stops retrying during setup.
 */
interface PayPalEvent {
  event_type?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    subscriber?: { email_address?: string };
    status?: string;
  };
}

export const POST: APIRoute = async ({ request }) => {
  let event: PayPalEvent;
  try {
    event = (await request.json()) as PayPalEvent;
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  // Signature verification is not implemented yet — refuse to act on unverified
  // payloads in production. Acknowledge so PayPal doesn't hammer retries.
  if (!env('PAYPAL_WEBHOOK_ID')) {
    console.warn('[paypal-webhook] PAYPAL_WEBHOOK_ID unset — acknowledging without acting (stub).');
    return new Response(JSON.stringify({ received: true, acted: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const type = event.event_type ?? '';
  const id = {
    sub: event.resource?.custom_id || undefined,
    email: event.resource?.subscriber?.email_address || undefined,
  };

  try {
    if (id.sub || id.email) {
      if (type === 'BILLING.SUBSCRIPTION.ACTIVATED' || type === 'PAYMENT.SALE.COMPLETED') {
        await grantProRole(id);
      } else if (
        type === 'BILLING.SUBSCRIPTION.CANCELLED' ||
        type === 'BILLING.SUBSCRIPTION.EXPIRED' ||
        type === 'BILLING.SUBSCRIPTION.SUSPENDED'
      ) {
        await revokeProRole(id);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'handler_error';
    console.error('[paypal-webhook] handler error:', msg);
    return new Response('handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
