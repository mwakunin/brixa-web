import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canSwitch, chooseFacility, chosenFacilityId, landing, type MyFacility, pickerOrder, roleNames, workIn } from "./facility";

const main: MyFacility = { id: "f-main", name: "Sample Hospital", status: "active", roles: ["records_clerk"] };
const westside: MyFacility = { id: "f-west", name: "Sample Hospital, Westside", status: "active", roles: ["records_clerk", "cashier"] };
const east: MyFacility = { id: "f-east", name: "Sample Hospital, East", status: "suspended", roles: ["records_clerk"] };

describe("where someone lands after signing in", () => {
  it("goes straight in when only one facility is open to them", () => {
    expect(landing([main], null)).toEqual({ kind: "in", facility: main });
    expect(landing([main, east], null)).toEqual({ kind: "in", facility: main });
  });

  it("asks where when several are open and none was chosen", () => {
    expect(landing([main, westside], null)).toEqual({ kind: "pick" });
  });

  it("goes back to the facility this browser chose, while it is open to them", () => {
    expect(landing([main, westside], "f-west")).toEqual({ kind: "in", facility: westside });
  });

  it("forgets a choice that is no longer theirs, or no longer open", () => {
    expect(landing([main, westside], "f-elsewhere")).toEqual({ kind: "pick" });
    expect(landing([main, westside, east], "f-east")).toEqual({ kind: "pick" });
    expect(landing([main, east], "f-east")).toEqual({ kind: "in", facility: main });
  });

  it("shows the picker when every facility is suspended, so they can see why", () => {
    expect(landing([east], null)).toEqual({ kind: "pick" });
  });

  it("says so when they are a member nowhere", () => {
    expect(landing([], null)).toEqual({ kind: "none" });
    expect(landing([], "f-main")).toEqual({ kind: "none" });
  });
});

describe("the facility a tab works in", () => {
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

  it("starts a new tab from the facility last chosen in this browser", () => {
    shared.set("brixa.facilityId", "f-west");
    expect(chosenFacilityId()).toBe("f-west");
  });

  it("keeps working in its own facility when another tab chooses a different one", () => {
    chooseFacility("f-main");
    shared.set("brixa.facilityId", "f-west");
    expect(chosenFacilityId()).toBe("f-main");
  });

  it("works in the facility it shows without changing what other tabs start from", () => {
    shared.set("brixa.facilityId", "f-west");
    workIn("f-main");
    expect(chosenFacilityId()).toBe("f-main");
    expect(shared.get("brixa.facilityId")).toBe("f-west");
  });

  it("keeps a choice the browser's storage refused", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
      removeItem: () => {},
    });
    chooseFacility("f-west");
    expect(chosenFacilityId()).toBe("f-west");
  });

  it("forgets the choice everywhere on signing out", () => {
    chooseFacility("f-main");
    chooseFacility(null);
    expect(chosenFacilityId()).toBeNull();
    expect(shared.has("brixa.facilityId")).toBe(false);
  });
});

describe("the order of the picker", () => {
  it("lists the open facilities first, then the suspended, each by name as the API gave them", () => {
    expect(pickerOrder([main, east, westside]).map(f => f.id)).toEqual(["f-main", "f-west", "f-east"]);
  });
});

describe("naming someone's roles", () => {
  it("names each by its job, in the order given", () => {
    expect(roleNames(["records_clerk", "cashier"])).toBe("Records clerk, Cashier");
    expect(roleNames(["pharm_tech"])).toBe("Pharmacy technician");
  });
});

describe("switching facility", () => {
  it("is offered only when another facility is open to them", () => {
    expect(canSwitch([main, westside])).toBe(true);
    expect(canSwitch([main, east])).toBe(false);
    expect(canSwitch([main])).toBe(false);
  });
});
