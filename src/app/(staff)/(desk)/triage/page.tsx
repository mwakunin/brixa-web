import type { Metadata } from "next";

import { Suspense } from "react";

import { en } from "@/strings/en";

import { Triage } from "./triage";

export const metadata: Metadata = { title: en.triage.pageTitle };

/** Triage (the journey's screen 4): who is waiting, and the patient with the nurse. */
export default function TriagePage() {
  return (
    // The patient chosen is read from the address, which is known only in the browser.
    <Suspense>
      <Triage />
    </Suspense>
  );
}
