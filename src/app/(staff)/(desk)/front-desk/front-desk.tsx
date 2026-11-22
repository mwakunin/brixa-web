"use client";

import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { type FoundPatient, opNumberOf, type PatientRecord } from "@/lib/patients";
import { emptyDraft, namesFromSearch, type RegistrationDraft } from "@/lib/registration";
import { en } from "@/strings/en";

import { type Arrival, PatientPanel } from "./patient-panel";
import { PatientSearch } from "./patient-search";
import { RegisterPatient, type Then } from "./register-patient";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * The front desk: who to find on the left, the patient in front of you on
 * the right, and one dark button that starts their visit. Registering a new
 * patient takes the whole desk until they are registered.
 *
 * The patient chosen is in the address as an id, so a reload or a slow
 * connection's retry comes back to them; registering is `?new`, so the
 * browser's Back leaves it. What was typed, in the search or the form, is
 * never in the address, and is kept while the desk is open: going back to
 * the search and returning finds the form as it was left.
 */
export function FrontDesk() {
  const params = useSearchParams();
  const asked = params.get("patient");
  const patientId = asked && UUID.test(asked) ? asked : null;
  const registering = params.has("new");
  const [term, setTerm] = useState("");
  // The search's own row for the patient chosen, shown while their record opens.
  const [chosen, setChosen] = useState<FoundPatient | null>(null);
  const [draft, setDraft] = useState<RegistrationDraft>(emptyDraft);
  // A patient just registered, with what the clerk asked to follow.
  const [arrival, setArrival] = useState<(Arrival & { patientId: string }) | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  function choose(patient: FoundPatient) {
    setChosen(patient);
    setArrival(null);
    window.history.replaceState(null, "", `?patient=${patient.id}`);
  }

  function findNext() {
    setTerm("");
    setChosen(null);
    setArrival(null);
    window.history.replaceState(null, "", window.location.pathname);
    searchInput.current?.focus();
  }

  function startRegistering() {
    // A search that found nobody was most often for the name: the form starts with it.
    if (draft === emptyDraft)
      setDraft({ ...emptyDraft, ...namesFromSearch(term) });
    window.history.pushState(null, "", "?new");
  }

  function registered(record: PatientRecord, then: Then) {
    setDraft(emptyDraft);
    setTerm("");
    setChosen(null);
    setArrival({ patientId: record.id, registeredAs: opNumberOf(record) ?? "", then });
    window.history.replaceState(null, "", `?patient=${record.id}`);
  }

  function openFound(patient: FoundPatient) {
    setDraft(emptyDraft);
    choose(patient);
  }

  if (registering) {
    return (
      <RegisterPatient
        draft={draft}
        onDraft={setDraft}
        onBack={() => window.history.replaceState(null, "", window.location.pathname)}
        onRegistered={registered}
        onOpen={openFound}
      />
    );
  }

  return (
    <main className="flex min-h-0 w-full flex-1 gap-5 px-6 py-4">
      <PatientSearch inputRef={searchInput} term={term} onTerm={setTerm} chosenId={patientId} onChoose={choose} onRegister={startRegistering} />
      {patientId
        ? (
            <PatientPanel
              key={patientId}
              id={patientId}
              found={chosen?.id === patientId ? chosen : null}
              arrival={arrival?.patientId === patientId ? arrival : null}
              onNext={findNext}
            />
          )
        : (
            <section aria-label={en.frontDesk.patient} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
              <h1 className="text-title font-bold">{en.frontDesk.nobodyChosen}</h1>
              <p className="max-w-[420px] text-secondary-foreground">{en.frontDesk.nobodyChosenHelp}</p>
            </section>
          )}
    </main>
  );
}
