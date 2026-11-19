import type { Metadata } from "next";

import { firstParam, safeNext } from "@/lib/navigation";
import { en } from "@/strings/en";

import { SetUpSignIn } from "./set-up-sign-in";

export const metadata: Metadata = { title: en.twoStep.setUp.pageTitle };

/**
 * Setting up two-step sign-in, which every member of staff does before any
 * desk (brixa-api SPEC.md §2). Reached from the session gate, or from any
 * call the API refuses with `two_factor_setup_required`; `?next=` is where
 * they were heading, to go on to once it is done.
 */
export default async function SetUpSignInPage({ searchParams }: PageProps<"/set-up-sign-in">) {
  const { next } = await searchParams;
  return <SetUpSignIn next={safeNext(firstParam(next))} />;
}
