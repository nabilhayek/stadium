import { connection } from "next/server";
import { Suspense } from "react";

async function Connection() {
  await connection();
  return null;
}

/**
 * Renders nothing. Tells Cache Components the route is request-time on purpose, so
 * metadata that reads `params` streams in instead of blocking the prerendered shell.
 */
export function DynamicMarker() {
  return (
    <Suspense>
      <Connection />
    </Suspense>
  );
}
