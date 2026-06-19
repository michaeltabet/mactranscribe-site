# MacTranscribe — marketing + auth + billing site

Production **Astro 4 (SSR)** site for [MacTranscribe](https://github.com/michaeltabet/mac-transcribe),
served at **https://mactranscribe.michaeltabet.com**. Server-rendered with the
`@astrojs/node` standalone adapter, real OIDC auth via Keycloak, and Stripe + PayPal
subscriptions that grant the `pro` realm role through the Keycloak Admin API.

The download button always tracks the latest GitHub Release of the app.

## Stack

- **Astro 4** (`output: 'server'`) + `@astrojs/node` (mode `standalone`), TypeScript (strict)
- **Auth**: Keycloak (realm `mactranscribe`), Authorization Code + PKCE, signed httpOnly session cookie (`jose`)
- **Payments**: Stripe subscription Checkout + webhook; PayPal subscription alternative + webhook stub
- No secret is touched at build time — every secret is read at **runtime**, so `npm run build` always succeeds.

## Pages

| Route        | What it does                                                            |
| ------------ | ----------------------------------------------------------------------- |
| `/`          | Landing — hero + app-window mockup, features, practice mode, pricing, download |
| `/pricing`   | Free $0 vs Pro $12/mo; Stripe checkout + PayPal alternative             |
| `/login`     | Continue with Google / email sign-in (both via Keycloak)               |
| `/dashboard` | Signed-in: email + plan; Pro → license + download, Free → upgrade       |
| `/download`  | Notarized macOS app → latest GitHub Release; BYOK note                  |

### API routes

| Route                     | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `GET /api/auth/login`     | Start OIDC (PKCE). `?idp=google` → `kc_idp_hint=google`. `?returnTo=` |
| `GET /api/auth/callback`  | Validate state, exchange code, verify ID token, set session cookie |
| `GET /api/auth/logout`    | Clear session + Keycloak end-session                              |
| `POST /api/checkout`      | Create Stripe subscription Checkout Session (`client_reference_id` = KC sub) |
| `POST /api/stripe-webhook`| Verify signature; grant/revoke `pro` via Keycloak Admin API      |
| `GET /api/paypal/start`   | Redirect to PayPal hosted subscribe page for `PAYPAL_PLAN_ID`     |
| `POST /api/paypal/webhook`| PayPal subscription events (stub — see note in file)             |
| `GET /api/health`         | Liveness/readiness; reports which integrations are configured     |

## Run locally

```bash
npm install
cp .env.example .env      # fill in (or leave blank — pages still render)
npm run dev               # http://localhost:4321
```

For full auth/billing locally, set at minimum `SESSION_SECRET`, the `KEYCLOAK_*`
vars, and `SESSION_COOKIE_SECURE=false` (so the cookie works over http). Point your
Keycloak `mactranscribe-web` client redirect URI at
`http://localhost:4321/api/auth/callback`.

## Build

```bash
npm run build             # emits dist/server/entry.mjs (standalone Node server)
npm run serve             # node ./dist/server/entry.mjs
```

Builds cleanly on **Node 24** with no external services and no secrets present.

## Environment variables

See [`.env.example`](./.env.example) for the full, documented list. Summary:

| Var | Required for | Notes |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | all | Canonical origin (no trailing slash) |
| `SESSION_SECRET` | auth | HS256 secret for session + handshake cookies (`openssl rand -base64 48`) |
| `SESSION_COOKIE_SECURE` | local dev | set `false` for http |
| `KEYCLOAK_ISSUER` | auth | `<kc-root>/realms/mactranscribe` |
| `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` | auth | confidential `mactranscribe-web` client |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | billing | `mactranscribe-billing` service account (`manage-users`) |
| `KEYCLOAK_ADMIN_CLIENT_ID` / `KEYCLOAK_ADMIN_BASE_URL` / `KEYCLOAK_REALM` | billing (optional) | sensible defaults |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | payments | |
| `STRIPE_PRICE_ID` | payments | recurring Price for $12/mo Pro |
| `STRIPE_WEBHOOK_SECRET` | payments | webhook signing secret |
| `PAYPAL_CLIENT_ID` / `PAYPAL_PLAN_ID` | payments (alt) | enables the PayPal button |
| `PAYPAL_ENV` / `PAYPAL_WEBHOOK_ID` | payments (optional) | `live`/`sandbox`; webhook gating |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | auth | configured **inside Keycloak** (the `google` IdP), not read by the site directly |

## Keycloak

[`keycloak/mactranscribe-realm.json`](./keycloak/mactranscribe-realm.json) is the
import-ready realm. It defines:

- realm roles `free` (default group) and `pro`
- public PKCE client `mactranscribe-app` (the desktop app)
- **confidential web client `mactranscribe-web`** (this site) with the correct
  redirect URIs and a realm-roles protocol mapper
- service-account client `mactranscribe-billing` (grant it `manage-users`)
- a **Google** identity provider (alias `google`, `clientId`/`clientSecret` via
  `${GOOGLE_CLIENT_ID}` / `${GOOGLE_CLIENT_SECRET}` or the admin UI)

Before import: replace every `CHANGE_ME_*` secret to match the site env, and set
the Google credentials. "Continue with Google" routes through Keycloak using
`kc_idp_hint=google`.

## Deploy (Kubernetes / Argo)

The site ships as a **container image** (it's SSR — not static HTML).

```bash
# 1. Build & push the image
./build-site.sh                 # builds + pushes ghcr.io/michaeltabet/mactranscribe-site:<sha>

# 2. Create the runtime secret (NOT in git)
kubectl -n mactranscribe-site create secret generic site-secrets \
  --from-literal=SESSION_SECRET=... \
  --from-literal=KEYCLOAK_ISSUER=... \
  --from-literal=KEYCLOAK_CLIENT_ID=mactranscribe-web \
  --from-literal=KEYCLOAK_CLIENT_SECRET=... \
  --from-literal=KEYCLOAK_ADMIN_CLIENT_SECRET=... \
  --from-literal=STRIPE_SECRET_KEY=... \
  --from-literal=STRIPE_PUBLISHABLE_KEY=... \
  --from-literal=STRIPE_PRICE_ID=... \
  --from-literal=STRIPE_WEBHOOK_SECRET=... \
  --from-literal=PAYPAL_CLIENT_ID=... \
  --from-literal=PAYPAL_PLAN_ID=...

# 3. Set image: in k8s/site.yaml, commit & push — Argo auto-syncs
```

`k8s/site.yaml` runs the image in the isolated `mactranscribe-site` namespace with
its own ingress + Let's Encrypt cert, non-root + read-only rootfs, and `/api/health`
probes. `argocd/application.yaml` points Argo at the `k8s/` path.

> The legacy static landing page lives at [`_legacy/landing-v1.html`](./_legacy/landing-v1.html)
> as the design reference. It is not deployed.
