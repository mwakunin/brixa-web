import { describe, expect, it } from "vitest";

import { canSwitch, landing, type MyFacility, roleNames } from "./facility";

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
