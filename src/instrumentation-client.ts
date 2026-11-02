import * as Sentry from "@sentry/nextjs";
import { sentryEnabled } from "@/lib/sentry-enabled";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// The shop is used on crowded stadium wifi. Errors only, no tracing and no session replay.
// The kitchen desk is a small staff app, so navigations and requests are traced there.
function tracesSampleRate() {
  if (typeof window === "undefined") return 0;
  return window.location.pathname.includes("/management") ? 1 : 0;
}

function startSentry() {
  Sentry.init({
    dsn,
    enabled: sentryEnabled(dsn),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampler: tracesSampleRate,
    beforeSend(event) {
      if (event.user) delete event.user.ip_address;
      return event;
    },
  });
}

if (typeof window !== "undefined" && "requestIdleCallback" in window) {
  window.requestIdleCallback(() => startSentry(), { timeout: 2000 });
} else {
  startSentry();
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
