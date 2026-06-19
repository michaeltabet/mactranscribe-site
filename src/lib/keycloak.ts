/**
 * Keycloak Admin API client.
 *
 * Used by the billing webhooks to grant/revoke the `pro` realm role after a
 * successful (or cancelled) subscription. Authenticates with the confidential
 * `mactranscribe-billing` service-account client via client_credentials.
 *
 * Env:
 *   KEYCLOAK_ISSUER          https://auth.example.com/realms/mactranscribe
 *   KEYCLOAK_ADMIN_CLIENT_ID       (default: mactranscribe-billing)
 *   KEYCLOAK_ADMIN_CLIENT_SECRET   service-account secret
 *   KEYCLOAK_ADMIN_BASE_URL  (optional) Keycloak root, e.g. https://auth.example.com
 *                            Derived from KEYCLOAK_ISSUER if not set.
 *   KEYCLOAK_REALM           (default: mactranscribe)
 */
import { requireEnv, env, envOr, keycloakIssuer } from './env';

const PRO_ROLE = 'pro';
const FREE_ROLE = 'free';

function realm(): string {
  return envOr('KEYCLOAK_REALM', 'mactranscribe');
}

/** Keycloak root URL (without /realms/...). */
function adminBase(): string {
  const explicit = env('KEYCLOAK_ADMIN_BASE_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  // Derive from the issuer: strip the trailing /realms/<realm>.
  const issuer = keycloakIssuer();
  return issuer.replace(/\/realms\/[^/]+$/, '');
}

interface AdminToken {
  access_token: string;
  expiresAt: number;
}
let _token: AdminToken | null = null;

/** Obtain (and cache) a service-account access token via client_credentials. */
async function getAdminToken(): Promise<string> {
  const now = Date.now();
  if (_token && _token.expiresAt > now + 10_000) return _token.access_token;

  const tokenUrl = `${adminBase()}/realms/${realm()}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: envOr('KEYCLOAK_ADMIN_CLIENT_ID', 'mactranscribe-billing'),
    client_secret: requireEnv('KEYCLOAK_ADMIN_CLIENT_SECRET'),
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Keycloak admin token failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _token = {
    access_token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return _token.access_token;
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${adminBase()}/admin/realms/${realm()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

interface KcUser {
  id: string;
  email?: string;
  username?: string;
}
interface KcRole {
  id: string;
  name: string;
}

/** Look up a user by Keycloak subject id, falling back to email. */
export async function findUser(opts: { sub?: string; email?: string }): Promise<KcUser | null> {
  if (opts.sub) {
    const res = await adminFetch(`/users/${encodeURIComponent(opts.sub)}`);
    if (res.ok) return (await res.json()) as KcUser;
  }
  if (opts.email) {
    const res = await adminFetch(`/users?email=${encodeURIComponent(opts.email)}&exact=true`);
    if (res.ok) {
      const users = (await res.json()) as KcUser[];
      if (users.length > 0) return users[0];
    }
  }
  return null;
}

async function getRealmRole(name: string): Promise<KcRole> {
  const res = await adminFetch(`/roles/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(`Keycloak role '${name}' not found (${res.status})`);
  }
  return (await res.json()) as KcRole;
}

/** Assign the `pro` realm role to a user (idempotent). */
export async function grantProRole(opts: { sub?: string; email?: string }): Promise<{ userId: string }> {
  const user = await findUser(opts);
  if (!user) throw new Error(`Keycloak user not found for ${JSON.stringify(opts)}`);
  const role = await getRealmRole(PRO_ROLE);
  const res = await adminFetch(`/users/${user.id}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify([{ id: role.id, name: role.name }]),
  });
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(() => '');
    throw new Error(`grantProRole failed (${res.status}): ${t.slice(0, 300)}`);
  }
  return { userId: user.id };
}

/** Remove the `pro` realm role from a user (used on cancellation; idempotent). */
export async function revokeProRole(opts: { sub?: string; email?: string }): Promise<{ userId: string }> {
  const user = await findUser(opts);
  if (!user) throw new Error(`Keycloak user not found for ${JSON.stringify(opts)}`);
  const role = await getRealmRole(PRO_ROLE);
  const res = await adminFetch(`/users/${user.id}/role-mappings/realm`, {
    method: 'DELETE',
    body: JSON.stringify([{ id: role.id, name: role.name }]),
  });
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(() => '');
    throw new Error(`revokeProRole failed (${res.status}): ${t.slice(0, 300)}`);
  }
  return { userId: user.id };
}

export { PRO_ROLE, FREE_ROLE };
