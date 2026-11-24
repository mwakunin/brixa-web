import type { Metadata } from "next";

import { Suspense } from "react";

import { en } from "@/strings/en";

import { Cashier } from "./cashier";

export const metadata: Metadata = { title: en.cashier.pageTitle };

/** The cashier (the journey's screen 9): who has money due, their bill, and the cashier's shift. */
export default function CashierPage() {
  return (
    // The visit chosen is read from the address, which is known only in the browser.
    <Suspense>
      <Cashier />
    </Suspense>
  );
}
