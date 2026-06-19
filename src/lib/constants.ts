/** Shared, non-secret product constants. */

export const PRODUCT = {
  name: 'MacTranscribe',
  tagline: 'Real-time transcription and an AI copilot that ramps new hires up fast.',
  description:
    'MacTranscribe captures onboarding meetings and 1:1s in real time and gives new hires an AI copilot that answers "how do we do X here?" in the moment — turning tribal, undocumented knowledge into instant answers and shortening time-to-productivity in week one. macOS 14+, Apple Silicon.',
} as const;

/** Where the primary CTA sends people to start (sign up / sign in). */
export const GET_STARTED_URL = '/login';

export const PRICING = {
  proMonthly: 12,
  currency: 'USD',
} as const;
