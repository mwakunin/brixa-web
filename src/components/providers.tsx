"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Server state for the whole app, kept in memory only.
 *
 * What the API returned is never written to the browser's storage: it holds
 * patient data, which stays in the database (the API's rule 10). A queue is
 * refetched when the window is looked at again, so a screen left open at a
 * service point is not an hour behind.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 },
      mutations: { retry: false },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
