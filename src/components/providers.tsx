"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api/refusal";
import { signInHref } from "@/lib/navigation";

/**
 * A call answered "not signed in": the session ended mid-shift. The sign-in
 * page is loaded afresh, not navigated to, so what the API returned leaves
 * memory with it; it brings them back to this page afterwards.
 */
function whenSignedOut(error: Error) {
  if (error instanceof ApiError && error.refusal.kind === "signed_out")
    window.location.assign(signInHref(window.location.pathname + window.location.search));
}

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
    queryCache: new QueryCache({ onError: whenSignedOut }),
    mutationCache: new MutationCache({ onError: whenSignedOut }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // A refusal will not change on asking again; a dropped connection might.
        retry: (failures, error) => !(error instanceof ApiError) && failures < 1,
      },
      mutations: { retry: false },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
