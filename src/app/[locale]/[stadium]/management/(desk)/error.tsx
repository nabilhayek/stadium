"use client";

import { RouteError } from "@/components/errors/route-error";

export default function DeskError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} tone="desk" />;
}
