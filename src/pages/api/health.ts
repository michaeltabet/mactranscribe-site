import type { APIRoute } from 'astro';
import { hasEnv } from '../../lib/env';

export const prerender = false;

/**
 * Liveness/readiness probe. Reports which integrations are configured at runtime
 * WITHOUT touching any secret values or making external calls. Always 200 so the
 * pod stays up even before secrets are wired.
 */
export const GET: APIRoute = () => {
  const body = {
    status: 'ok',
    service: 'mactranscribe-site',
    integrations: {
      keycloak: hasEnv('KEYCLOAK_ISSUER', 'KEYCLOAK_CLIENT_ID', 'KEYCLOAK_CLIENT_SECRET'),
      session: hasEnv('SESSION_SECRET'),
      stripe: hasEnv('STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID'),
      stripeWebhook: hasEnv('STRIPE_WEBHOOK_SECRET'),
      keycloakAdmin: hasEnv('KEYCLOAK_ADMIN_CLIENT_SECRET'),
      paypal: hasEnv('PAYPAL_CLIENT_ID', 'PAYPAL_PLAN_ID'),
    },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
