/**
 * Runtime environment access.
 *
 * CRITICAL: nothing here runs at build time. Every getter reads `process.env`
 * lazily so that `astro build` never hard-fails on a missing secret. Pages and
 * API routes call `requireEnv(...)` only when a request actually needs the value,
 * and surface a clean error to the user instead of crashing the build.
 */

export class MissingEnvError extends Error {
  constructor(public readonly key: string) {
    super(`Missing required environment variable: ${key}`);
    this.name = 'MissingEnvError';
  }
}

/** Read an optional env var. Returns `undefined` if unset or empty. */
export function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

/** Read a required env var. Throws `MissingEnvError` at request time if absent. */
export function requireEnv(key: string): string {
  const v = env(key);
  if (!v) throw new MissingEnvError(key);
  return v;
}

/** Read an env var with a fallback default. */
export function envOr(key: string, fallback: string): string {
  return env(key) ?? fallback;
}

/** True if every named key is present and non-empty. */
export function hasEnv(...keys: string[]): boolean {
  return keys.every((k) => !!env(k));
}

/** The canonical public base URL of this deployment. */
export function baseUrl(): string {
  return envOr('PUBLIC_BASE_URL', 'https://mactranscribe.michaeltabet.com').replace(/\/$/, '');
}

/** Keycloak issuer URL (e.g. https://auth.example.com/realms/mactranscribe). */
export function keycloakIssuer(): string {
  return requireEnv('KEYCLOAK_ISSUER').replace(/\/$/, '');
}
