import { describe, expect, it } from "vitest";

import { deskAt, desksFor } from "./desks";

describe("the desks a person has", () => {
  it("are the front desk for a records clerk, and the cashier's for a cashier", () => {
    expect(desksFor(["records_clerk"]).map(desk => desk.id)).toEqual(["front-desk"]);
    expect(desksFor(["cashier"]).map(desk => desk.id)).toEqual(["cashier"]);
  });

  it("are listed front desk first, whatever order the roles come in", () => {
    expect(desksFor(["cashier", "records_clerk"]).map(desk => desk.id)).toEqual(["front-desk", "cashier"]);
  });

  it("are none while no desk for their roles is built", () => {
    expect(desksFor(["doctor"])).toEqual([]);
    expect(desksFor([])).toEqual([]);
  });
});

describe("the desk a page belongs to", () => {
  it("is found by its path and the paths below it", () => {
    expect(deskAt("/front-desk")?.id).toBe("front-desk");
    expect(deskAt("/front-desk/new-patient")?.id).toBe("front-desk");
    expect(deskAt("/cashier")?.id).toBe("cashier");
  });

  it("is none for another page, even one whose name begins the same", () => {
    expect(deskAt("/")).toBeNull();
    expect(deskAt("/front-desks")).toBeNull();
  });
});
