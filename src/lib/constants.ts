/** Shared, non-secret product constants. */

export const PRODUCT = {
  name: 'MacTranscribe',
  tagline: 'Live transcription and an AI copilot for your Mac.',
  description:
    'Real-time transcription and an on-device AI copilot for interviews, meetings, and practice. Mock interviews, a coding-assessment board, and private on-device OCR. macOS 14+, Apple Silicon.',
} as const;

/** Latest notarized macOS build. The download button always tracks this URL. */
export const DOWNLOAD_URL = 'https://github.com/michaeltabet/mac-transcribe/releases/latest';

export const PRICING = {
  proMonthly: 12,
  currency: 'USD',
} as const;
