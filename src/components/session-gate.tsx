"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CenteredPage } from "@/components/centered-page";
import { useSession } from "@/lib/auth-client";
import { signInHref } from "@/lib/navigation";
import { en } from "@/strings/en";

/**
 * Shows its pages only to someone signed in.
 *
 * The session is a cookie on the API's host, which this app's server never
 * sees, so the check runs here, in the browser, by asking the API. Someone
 * signed out is sent to sign in and brought back afterwards. A check that
 * could not reach the API says so and offers to try again: it is not taken
 * as signed out, which would throw away the page they were on.
 *
 * Hiding a page is a convenience: the API still checks every call.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const { data, isPending, error, refetch } = useSession();
  const router = useRouter();
  const signedOut = !isPending && !error && !data;

  useEffect(() => {
    if (signedOut)
      router.replace(signInHref(window.location.pathname + window.location.search));
  }, [signedOut, router]);

  if (error && !data) {
    return (
      <CenteredPage>
        <p role="alert" className="max-w-md text-center">{en.errors.offline}</p>
        <button type="button" onClick={() => void refetch()} className="h-12 rounded-lg bg-slate-900 px-6 font-semibold text-white">
          {en.session.tryAgain}
        </button>
      </CenteredPage>
    );
  }
  if (!data) {
    return (
      <CenteredPage>
        <p role="status" className="text-slate-600">{en.session.checking}</p>
      </CenteredPage>
    );
  }
  return children;
}
