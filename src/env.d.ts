/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  // Public (safe to expose to the client)
  readonly PUBLIC_BASE_URL?: string;
  readonly STRIPE_PUBLISHABLE_KEY?: string;
  readonly PAYPAL_CLIENT_ID?: string;
  readonly PAYPAL_PLAN_ID?: string;

  // Server-only secrets are read via process.env at runtime, never imported
  // into client code, so they are intentionally not declared here.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    session: import('./lib/session').Session | null;
  }
}
