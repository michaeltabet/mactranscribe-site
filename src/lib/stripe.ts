/**
 * Lazy Stripe client. Instantiated only when a request needs it, so the build
 * never touches STRIPE_SECRET_KEY.
 */
import Stripe from 'stripe';
import { requireEnv } from './env';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
    apiVersion: '2024-06-20',
    appInfo: { name: 'mactranscribe-site' },
  });
  return _stripe;
}
