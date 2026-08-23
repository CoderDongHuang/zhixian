const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryOptions = {
  dsn,
  enabled: Boolean(dsn),
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
};

let initialized = false;

export function initializeSentry(init: (options: typeof sentryOptions) => void) {
  if (initialized) return;
  init(sentryOptions);
  initialized = true;
}
