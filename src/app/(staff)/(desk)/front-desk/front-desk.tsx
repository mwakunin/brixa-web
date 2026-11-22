"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import type { FoundPatient } from "@/lib/patients";

import { en } from "@/strings/en";

import { PatientPanel } from "./patient-panel";
import { PatientSearch } from "./patient-search";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * The front desk: who to find on the left, the patient in front of you on
 * the right, and one dark button that starts their visit.
 *
 * The patient chosen is in the address as an id, so a reload or a slow
 * connection's retry comes back to them; what was typed in the search is
 * not, since a search may be a name.
 */
export function FrontDesk() {
  const asked = useSearchParams().get("patient");
  const patientId = asked && UUID.test(asked) ? asked : null;
  const [term, setTerm] = useState("");
  // The search's own row for the patient chosen, shown while their record opens.
  const [chosen, setChosen] = useState<FoundPatient | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  function choose(patient: FoundPatient) {
    setChosen(patient);
    window.history.replaceState(null, "", `?patient=${patient.id}`);
  }

  function findNext() {
    setTerm("");
    setChosen(null);
    window.history.replaceState(null, "", window.location.pathname);
    searchInput.current?.focus();
  }

  return (
    <main className="flex min-h-0 w-full flex-1 gap-5 px-6 py-4">
      <PatientSearch inputRef={searchInput} term={term} onTerm={setTerm} chosenId={patientId} onChoose={choose} />
      {patientId
        ? <PatientPanel key={patientId} id={patientId} found={chosen?.id === patientId ? chosen : null} onNext={findNext} />
        : (
            <section aria-label={en.frontDesk.patient} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
              <h1 className="text-title font-bold">{en.frontDesk.nobodyChosen}</h1>
              <p className="max-w-[420px] text-secondary-foreground">{en.frontDesk.nobodyChosenHelp}</p>
            </section>
          )}
    </main>
  );
}
