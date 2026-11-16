/**
 * The facility this browser is working in.
 *
 * A person may work at several facilities; the one chosen at the picker is
 * sent as `X-Facility-Id` on every tenant request (the hostname never chooses
 * a tenant). Only its id is kept, and an id is not patient data. Storage can
 * be missing or blocked, so every access is guarded and the app works without
 * it: the picker is simply shown again.
 */
const KEY = "brixa.facilityId";

export function chosenFacilityId(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  }
  catch {
    return null;
  }
}

export function chooseFacility(id: string | null): void {
  try {
    if (id === null)
      globalThis.localStorage?.removeItem(KEY);
    else
      globalThis.localStorage?.setItem(KEY, id);
  }
  catch {
    // Nothing to do: the choice lasts for this page only.
  }
}
