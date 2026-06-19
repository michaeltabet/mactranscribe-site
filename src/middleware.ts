import { defineMiddleware } from 'astro:middleware';
import { getSession } from './lib/session';

/**
 * Populate `Astro.locals.session` for every request so pages and components can
 * read the signed-in user without re-parsing the cookie. Never throws — a missing
 * or invalid cookie simply yields `null`.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.session = await getSession(context.cookies);
  return next();
});
