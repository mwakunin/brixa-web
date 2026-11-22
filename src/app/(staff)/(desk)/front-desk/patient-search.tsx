"use client";

import { useId } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useDebounced } from "@/hooks/use-debounced";
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, usePatientSearch } from "@/hooks/use-patients";
import { failureText } from "@/lib/api/refusal";
import { type FoundPatient, fullName } from "@/lib/patients";
import { cn } from "@/lib/utils";
import { en } from "@/strings/en";

import { FoundLine } from "./found-line";

/** A pause in typing this long sends the search: each one is audited, and limited per person. */
const TYPING_PAUSE_MS = 350;

interface Props {
  inputRef: React.Ref<HTMLInputElement>;
  term: string;
  onTerm: (term: string) => void;
  chosenId: string | null;
  onChoose: (patient: FoundPatient) => void;
  onRegister: () => void;
}

/**
 * Finding a patient by any of what they carry: a name, a phone, their
 * patient number or their ID number. Each match shows enough to tell two
 * people of one name apart, so the clerk opens only the record they mean.
 */
export function PatientSearch({ inputRef, term, onTerm, chosenId, onChoose, onRegister }: Props) {
  const id = useId();
  const typed = term.trim();
  const q = useDebounced(typed, TYPING_PAUSE_MS);
  const search = usePatientSearch(q);
  const asking = typed.length >= SEARCH_MIN_LENGTH;
  const found = asking ? search.data : undefined;

  return (
    <section aria-label={en.frontDesk.find} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <label htmlFor={id} className="text-lg font-semibold">{en.frontDesk.find}</label>
        <input
          id={id}
          ref={inputRef}
          type="search"
          maxLength={SEARCH_MAX_LENGTH}
          value={term}
          onChange={event => onTerm(event.target.value)}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          spellCheck={false}
          className="h-[52px] rounded-lg border-2 border-foreground bg-card px-3.5 text-lg text-foreground"
        />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">{en.frontDesk.findHint}</p>
        <p role="status" className={cn("text-sm text-muted-foreground", !(asking && search.isFetching) && "sr-only")}>
          {asking && search.isFetching ? en.frontDesk.searching : ""}
        </p>
        {asking && search.isError && !search.isFetching && (
          <Alert variant="problem">
            <AlertDescription>{failureText(search.error)}</AlertDescription>
            <Button variant="link" className="self-start" onClick={() => void search.refetch()}>{en.errors.tryAgain}</Button>
          </Alert>
        )}
        {found && found.length === 0 && !search.isPlaceholderData && !search.isError && (
          <p className="text-secondary-foreground">{en.frontDesk.nobodyFound(q)}</p>
        )}
        {found && found.length > 0 && (
          <ul aria-label={en.frontDesk.results} className="flex flex-col gap-2">
            {found.map((patient) => {
              const pressed = patient.id === chosenId;
              return (
                <li key={patient.id}>
                  <button
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => onChoose(patient)}
                    className={cn(
                      "flex min-h-16 w-full flex-col gap-0.5 rounded-lg border px-3.5 py-2.5 text-left",
                      pressed ? "border-selected bg-selected-tint shadow-[inset_0_0_0_1px_var(--selected)]" : "border-border bg-card hover:border-border-strong",
                    )}
                  >
                    <span className={pressed ? "font-bold" : "font-semibold"}>{fullName(patient)}</span>
                    <FoundLine patient={patient} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Button variant="second" onClick={onRegister} className="min-h-12 text-base">{en.register.link}</Button>
    </section>
  );
}
