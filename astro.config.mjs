// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// SSR build targeting a standalone Node server (dist/server/entry.mjs).
// PUBLIC_BASE_URL is read at runtime, not build time, so the build never fails
// on a missing/placeholder value. We only use it for the `site` field, which is
// purely for canonical-URL/sitemap generation and is safe to leave as a default.
const SITE = process.env.PUBLIC_BASE_URL || 'https://mactranscribe.michaeltabet.com';

export default defineConfig({
  site: SITE,
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: {
    port: Number(process.env.PORT) || 4321,
    host: true,
  },
  vite: {
    // Keep server-only secrets out of the client bundle. Anything not prefixed
    // with PUBLIC_ is already stripped by Astro, but we make it explicit.
    ssr: {
      noExternal: [],
    },
  },
});
