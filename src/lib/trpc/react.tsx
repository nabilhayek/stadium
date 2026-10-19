"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@/server/trpc/root";
import { trpc } from "./client";

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpc} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
