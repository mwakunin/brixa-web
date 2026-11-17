import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chooseFacility, type MyFacility, settle } from "@/lib/facility";

import { FACILITY_HEADER, facilityHeader } from "./client";

const main: MyFacility = { id: "f-main", name: "Sample Hospital", status: "active", roles: ["records_clerk"] };
const westside: MyFacility = { id: "f-west", name: "Sample Hospital, Westside", status: "active", roles: ["records_clerk", "cashier"] };

type OnRequest = NonNullable<typeof facilityHeader.onRequest>;

/** The facility header on a request as it leaves this tab. */
async function facilityNamed(request = new Request("http://api.test/patients")): Promise<string | null> {
  const sent = await facilityHeader.onRequest!({ request } as Parameters<OnRequest>[0]);
  return (sent as Request).headers.get(FACILITY_HEADER);
}

describe("the facility a request names", () => {
  /** The browser's storage, shared by every tab of this app; another tab writes it directly. */
  let shared: Map<string, string>;

  beforeEach(() => {
    shared = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => shared.get(key) ?? null,
      setItem: (key: string, value: string) => void shared.set(key, value),
      removeItem: (key: string) => void shared.delete(key),
    });
    chooseFacility(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is the one this tab shows, though it started from storage and another tab has since chosen another", async () => {
    shared.set("brixa.facilityId", "f-west");
    settle([main, westside]);

    shared.set("brixa.facilityId", "f-main");

    expect(await facilityNamed()).toBe("f-west");
  });

  it("is left as it is when a request names its own", async () => {
    chooseFacility("f-west");

    expect(await facilityNamed(new Request("http://api.test/patients", { headers: { [FACILITY_HEADER]: "f-main" } }))).toBe("f-main");
  });
});
