"use client";

import { useParams } from "next/navigation";
import { RouteError } from "@/components/errors/route-error";

export default function ShopError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { stadium } = useParams<{ stadium: string }>();
  return <RouteError error={error} retry={retry} tone="shop" homeHref={`/${stadium}`} />;
}
