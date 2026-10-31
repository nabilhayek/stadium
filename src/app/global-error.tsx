"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f4f4f1", color: "#171717", fontFamily: "sans-serif" }}>
        <main style={{ maxWidth: 420, margin: "20vh auto", padding: "0 24px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>Reload the page. If it keeps happening, the kitchen has already been told.</p>
        </main>
      </body>
    </html>
  );
}
