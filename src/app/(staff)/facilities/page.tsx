import type { Metadata } from "next";

import { en } from "@/strings/en";

import { FacilityPicker } from "./facility-picker";

export const metadata: Metadata = { title: en.facilities.pageTitle };

/** Where are you working (the journey's screen 2): for staff at more than one facility, or switching. */
export default function FacilitiesPage() {
  return <FacilityPicker />;
}
