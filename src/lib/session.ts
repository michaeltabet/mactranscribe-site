/**
 * Signed, httpOnly session cookie.
 *
 * The session is a compact JWT (HS256) signed with SESSION_SECRET. It carries the
 * minimal claims the site needs (Keycloak subject, email, plan) plus the ID token
 * so logout can pass `id_token_hint` back to Keycloak. No tokens are exposed to
 * client JS — the cookie is httpOnly + Secure + SameSite=Lax.
 */
import * as jose from 'jose';
import type { AstroCookies } from 'astro';
import { requireEnv, env } from './env';

export const SESSION_COOKIE = 'mt_session';
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

export interface Session {
  sub: string;
  email: string;
  name?: string;
  isPro: boolean;
  /** Original Keycloak ID token, kept only for logout's id_token_hint. */
  idToken?: string;
}

function secretKey(): Uint8Array {
  const secret = requireEnv('SESSION_SECRET');
  return new TextEncoder().encode(secret);
}

function cookieSecure(): boolean {
  // Default to Secure in production; allow override for local http dev.
  return (env('SESSION_COOKIE_SECURE') ?? 'true') !== 'false';
}

/** Sign a session into a JWT string. */
export async function signSession(session: Session): Promise<string> {
  return await new jose.SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/** Verify a session JWT and return its payload, or null if invalid/expired. */
export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jose.jwtVerify(token, secretKey());
    if (!payload.sub && !(payload as Record<string, unknown>).email) return null;
    return {
      sub: String(payload.sub ?? ''),
      email: String((payload as Record<string, unknown>).email ?? ''),
      name: (payload as Record<string, unknown>).name as string | undefined,
      isPro: (payload as Record<string, unknown>).isPro === true,
      idToken: (payload as Record<string, unknown>).idToken as string | undefined,
    };
  } catch {
    return null;
  }
}

/** Persist a session as an httpOnly cookie on the response. */
export async function setSessionCookie(cookies: AstroCookies, session: Session): Promise<void> {
  const token = await signSession(session);
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

/** Read & verify the session from the request cookies. */
export async function getSession(cookies: AstroCookies): Promise<Session | null> {
  const raw = cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return await verifySession(raw);
}

/** Clear the session cookie. */
export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

// ---- short-lived OIDC handshake cookies (state / nonce / pkce verifier) ----

const FLOW_COOKIE = 'mt_oidc';
const FLOW_MAX_AGE = 60 * 10; // 10 minutes

export interface FlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export async function setFlowCookie(cookies: AstroCookies, flow: FlowState): Promise<void> {
  const token = await new jose.SignJWT({ ...flow })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_MAX_AGE}s`)
    .sign(secretKey());
  cookies.set(FLOW_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: FLOW_MAX_AGE,
  });
}

export async function getFlowCookie(cookies: AstroCookies): Promise<FlowState | null> {
  const raw = cookies.get(FLOW_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jose.jwtVerify(raw, secretKey());
    const p = payload as Record<string, unknown>;
    if (!p.state || !p.codeVerifier) return null;
    return {
      state: String(p.state),
      nonce: String(p.nonce ?? ''),
      codeVerifier: String(p.codeVerifier),
      returnTo: String(p.returnTo ?? '/dashboard'),
    };
  } catch {
    return null;
  }
}

export function clearFlowCookie(cookies: AstroCookies): void {
  cookies.delete(FLOW_COOKIE, { path: '/' });
}
