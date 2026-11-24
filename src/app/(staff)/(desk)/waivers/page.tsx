import type { Metadata } from "next";

import { Suspense } from "react";

import { en } from "@/strings/en";

import { Waivers } from "./waivers";

export const metadata: Metadata = { title: en.waivers.pageTitle };

/** The in-charge's waivers (the journey's screen 9b): those waiting, and the one chosen, to approve or reject. */
export default function WaiversPage() {
  return (
    // The waiver chosen is read from the address, which is known only in the browser.
    <Suspense>
      <Waivers />
    </Suspense>
  );
}
