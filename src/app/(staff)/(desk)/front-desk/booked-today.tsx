"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useId } from "react";

import type { paths } from "@/lib/api/schema";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointmentsKey, servicePointsKey, useAppointments } from "@/hooks/use-desk";
import { visitsKey } from "@/hooks/use-patients";
import { useRepeatSafe } from "@/hooks/use-repeat-safe";
import { api } from "@/lib/api/client";
import { failureText, unwrap } from "@/lib/api/refusal";
import { IDEMPOTENCY_HEADER } from "@/lib/api/repeat-safe";
import { businessDate } from "@/lib/dates";
import { en } from "@/strings/en";

type Appointment = paths["/appointments"]["get"]["responses"][200]["content"]["application/json"]["appointments"][number];
type CheckedIn = paths["/appointments/{id}/check-in"]["post"]["responses"][200]["content"]["application/json"];

const words = en.frontDesk;

/**
 * Today's bookings, by time, each checked in with one press: that opens the
 * patient's visit, or uses the one open, and sends them to triage like any
 * visit. "Today" is Nairobi's.
 */
export function BookedToday() {
  const id = useId();
  const today = businessDate();
  const appointments = useAppointments(today);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-5">
      <h2 id={id} className="text-lg font-semibold">{words.bookedToday}</h2>
      {appointments.data
        ? appointments.data.length === 0
          ? <p className="text-secondary-foreground">{words.bookedNone}</p>
          : (
              <ul className="flex flex-col">
                {appointments.data.map(appointment => <Booking key={appointment.id} appointment={appointment} date={today} />)}
              </ul>
            )
        : appointments.isError
          ? (
              <Alert variant="problem">
                <AlertDescription>{failureText(appointments.error)}</AlertDescription>
                <Button variant="link" className="self-start" onClick={() => void appointments.refetch()}>{en.errors.tryAgain}</Button>
              </Alert>
            )
          : <p role="status" className="text-muted-foreground">{words.bookedChecking}</p>}
    </section>
  );
}

/**
 * One booking. Checking in is repeat-safe: with no answer, the button sends
 * the same check-in again. The answer marks the row checked in, without
 * reading the day's list again.
 */
function Booking({ appointment, date }: { appointment: Appointment; date: string }) {
  const queryClient = useQueryClient();
  const checkIn = useRepeatSafe<{ id: string }, CheckedIn>(`check-in:${appointment.id}`, async ({ key, body }, signal) => {
    const answer = await unwrap(api.POST("/appointments/{id}/check-in", { params: { path: { id: body.id } }, body: {}, headers: { [IDEMPOTENCY_HEADER]: key }, signal }));
    queryClient.setQueryData<Appointment[]>(appointmentsKey(date), list => list?.map(listed => (listed.id === body.id ? { ...listed, status: answer.appointment.status, encounterId: answer.encounterId } : listed)));
    // Someone now waits at triage, and the patient has a visit open.
    void queryClient.invalidateQueries({ queryKey: servicePointsKey });
    void queryClient.invalidateQueries({ queryKey: visitsKey(appointment.patient.id) });
    return answer;
  });
  const { state } = checkIn;

  return (
    <li className="flex flex-col gap-2 border-t border-secondary py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{appointment.patient.name}</span>
          <span className="text-sm text-muted-foreground">{words.bookedLine(appointment.time ?? words.noTime, appointment.servicePoint.name)}</span>
        </span>
        {appointment.status === "checked_in"
          ? (
              <Badge kind="desk">
                <Check aria-hidden="true" strokeWidth={2.5} />
                {words.checkedIn}
              </Badge>
            )
          : (
              <Button variant="quiet" disabled={state.kind === "sending"} onClick={() => void checkIn.press({ id: appointment.id })}>
                {state.kind === "sending" ? words.checkingIn : state.kind === "no_answer" ? words.tryAgainCheckIn : words.checkIn}
              </Button>
            )}
      </div>
      {state.kind === "no_answer" && (
        <Alert variant="problem" className="text-sm">
          <AlertTitle>{en.writes.noAnswerTitle}</AlertTitle>
          <AlertDescription>{en.writes.noAnswer}</AlertDescription>
        </Alert>
      )}
      {state.kind === "refused" && (
        <Alert variant="problem" className="text-sm">
          <AlertTitle>{en.writes.notDone}</AlertTitle>
          <AlertDescription>{failureText(state.error)}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}
