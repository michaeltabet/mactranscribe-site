/**
 * OpenID Connect helpers for Keycloak — Authorization Code flow with PKCE.
 *
 * All network calls happen at REQUEST time inside API routes, never at build
 * time. The OIDC discovery document is cached in-process after the first fetch.
 */
import * as jose from 'jose';
import { keycloakIssuer, requireEnv, env } from './env';

interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint: string;
  jwks_uri: string;
}

let _discovery: { issuer: string; doc: OidcDiscovery } | null = null;
let _jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
let _jwksIssuer: string | null = null;

/** Fetch (and cache) the realm's OIDC discovery document. */
export async function discover(): Promise<OidcDiscovery> {
  const issuer = keycloakIssuer();
  if (_discovery && _discovery.issuer === issuer) return _discovery.doc;

  const url = `${issuer}/.well-known/openid-configuration`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) for ${url}`);
  }
  const doc = (await res.json()) as OidcDiscovery;
  _discovery = { issuer, doc };
  return doc;
}

function jwks(jwksUri: string) {
  const issuer = keycloakIssuer();
  if (!_jwks || _jwksIssuer !== issuer) {
    _jwks = jose.createRemoteJWKSet(new URL(jwksUri));
    _jwksIssuer = issuer;
  }
  return _jwks;
}

// ---- PKCE ----

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/** Generate a high-entropy PKCE code verifier. */
export function makeCodeVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Derive the S256 code challenge from a verifier. */
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Generate an opaque random token (used for state/nonce). */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(24)));
}

// ---- flow ----

export interface AuthUrlParams {
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  /** When set (e.g. "google"), Keycloak skips its login form and bounces to the IdP. */
  idpHint?: string;
  scope?: string;
}

/** Build the Keycloak authorization URL the browser should be redirected to. */
export async function buildAuthUrl(p: AuthUrlParams): Promise<string> {
  const doc = await discover();
  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set('client_id', requireEnv('KEYCLOAK_CLIENT_ID'));
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', p.scope ?? 'openid email profile roles');
  url.searchParams.set('state', p.state);
  url.searchParams.set('nonce', p.nonce);
  url.searchParams.set('code_challenge', p.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (p.idpHint) url.searchParams.set('kc_idp_hint', p.idpHint);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/** Exchange an authorization code for tokens (confidential client + PKCE verifier). */
export async function exchangeCode(opts: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const doc = await discover();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: requireEnv('KEYCLOAK_CLIENT_ID'),
    client_secret: requireEnv('KEYCLOAK_CLIENT_SECRET'),
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

export interface VerifiedIdToken {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  roles: string[];
  isPro: boolean;
  raw: jose.JWTPayload;
}

interface IdTokenClaims extends jose.JWTPayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
}

/** Verify an ID token's signature/issuer/audience and extract realm roles. */
export async function verifyIdToken(idToken: string, expectedNonce?: string): Promise<VerifiedIdToken> {
  const doc = await discover();
  const { payload } = await jose.jwtVerify(idToken, jwks(doc.jwks_uri), {
    issuer: doc.issuer,
    audience: requireEnv('KEYCLOAK_CLIENT_ID'),
  });
  const claims = payload as IdTokenClaims;

  if (expectedNonce && claims.nonce !== expectedNonce) {
    throw new Error('OIDC nonce mismatch');
  }

  const roles = claims.realm_access?.roles ?? [];
  return {
    sub: String(claims.sub),
    email: claims.email ?? claims.preferred_username ?? '',
    emailVerified: claims.email_verified === true,
    name: claims.name,
    roles,
    isPro: roles.includes('pro'),
    raw: payload,
  };
}

/** Build the Keycloak end-session (logout) URL. */
export async function buildLogoutUrl(opts: { idTokenHint?: string; postLogoutRedirectUri: string }): Promise<string> {
  const doc = await discover();
  const url = new URL(doc.end_session_endpoint);
  url.searchParams.set('post_logout_redirect_uri', opts.postLogoutRedirectUri);
  if (opts.idTokenHint) url.searchParams.set('id_token_hint', opts.idTokenHint);
  const clientId = env('KEYCLOAK_CLIENT_ID');
  if (clientId) url.searchParams.set('client_id', clientId);
  return url.toString();
}
