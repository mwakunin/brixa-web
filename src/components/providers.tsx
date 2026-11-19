"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api/refusal";
import { setUpSignInHref, signInHref } from "@/lib/navigation";

/**
 * A call answered "not signed in": the session ended mid-shift. The sign-in
 * page is loaded afresh, not navigated to, so what the API returned leaves
 * memory with it; it brings them back to this page afterwards. A call
 * answered "set up two-step sign-in first" goes to that page the same way.
 */
function whenNotSignedIn(error: Error) {
  if (!(error instanceof ApiError))
    return;
  const here = window.location.pathname + window.location.search;
  const { refusal } = error;
  if (refusal.kind === "signed_out")
    window.location.assign(signInHref(here));
  else if (refusal.kind === "not_allowed" && refusal.code === "two_factor_setup_required")
    window.location.assign(setUpSignInHref(here));
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
    queryCache: new QueryCache({ onError: whenNotSignedIn }),
    mutationCache: new MutationCache({ onError: whenNotSignedIn }),
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
