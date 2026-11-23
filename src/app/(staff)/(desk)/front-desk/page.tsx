import type { Metadata } from "next";

import { Suspense } from "react";

import { en } from "@/strings/en";

import { FrontDesk } from "./front-desk";

export const metadata: Metadata = { title: en.frontDesk.pageTitle };

/** The front desk (the journey's screen 3): find the patient, and start today's visit. */
export default function FrontDeskPage() {
  return (
    // The patient chosen is read from the address, which is known only in the browser.
    <Suspense>
      <FrontDesk />
    </Suspense>
  );
}
