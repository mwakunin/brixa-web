"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { patientKey } from "@/hooks/use-patients";
import { waitingBody } from "@/hooks/use-repeat-safe";
import { type FoundPatient, opNumberOf, type PatientRecord } from "@/lib/patients";
import { emptyDraft, namesFromSearch, type RegistrationDraft } from "@/lib/registration";
import { en } from "@/strings/en";

import { BookedToday } from "./booked-today";
import { type Arrival, PatientPanel } from "./patient-panel";
import { PatientSearch } from "./patient-search";
import { type Registering, RegisterPatient, type Then } from "./register-patient";

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
  // A registration still waiting for its answer shows its form as it was sent, though the desk was left meanwhile.
  const [draft, setDraft] = useState<RegistrationDraft>(() => waitingBody<Registering>("register")?.draft ?? emptyDraft);
  // A patient just registered, with what the clerk asked to follow.
  const [arrival, setArrival] = useState<(Arrival & { patientId: string }) | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  function choose(patient: FoundPatient) {
    // Choosing a patient is asking to see them now: what was read before shows while their record and visits are read again.
    void queryClient.invalidateQueries({ queryKey: patientKey(patient.id) });
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

  const registered = useCallback((record: PatientRecord, then: Then) => {
    setDraft(emptyDraft);
    setTerm("");
    setChosen(null);
    setArrival({ patientId: record.id, registeredAs: opNumberOf(record) ?? "", then });
    window.history.replaceState(null, "", `?patient=${record.id}`);
  }, []);

  // Once sent, the visit asked for on registering is not sent again, whatever is shown again.
  const arrivalSent = useCallback(() => setArrival(known => known && { ...known, then: null }), []);

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
      {/* Who to find, and who is booked: a column that scrolls on its own. */}
      <div className="flex min-h-0 w-[300px] shrink-0 flex-col gap-4 overflow-y-auto lg:w-[340px] xl:w-[380px] 2xl:w-[440px]">
        <PatientSearch inputRef={searchInput} term={term} onTerm={setTerm} chosenId={patientId} onChoose={choose} onRegister={startRegistering} />
        <BookedToday />
      </div>
      {patientId
        ? (
            <PatientPanel
              key={patientId}
              id={patientId}
              found={chosen?.id === patientId ? chosen : null}
              arrival={arrival?.patientId === patientId ? arrival : null}
              onArrivalSent={arrivalSent}
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
