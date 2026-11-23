import { describe, expect, it } from "vitest";

import { facilitiesHref, firstParam, forgotPasswordHref, idParam, safeNext, setUpSignInHref, signInHref } from "./navigation";

describe("where to go after signing in", () => {
  it("goes back to a page of this app", () => {
    expect(safeNext("/facilities")).toBe("/facilities");
    expect(safeNext("/queue?servicePointId=abc")).toBe("/queue?servicePointId=abc");
  });

  it("goes home when nothing was asked", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("never leaves the app", () => {
    expect(safeNext("https://example.com")).toBe("/");
    expect(safeNext("//example.com")).toBe("/");
    expect(safeNext("/\\example.com")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("reads the path as the browser will, which drops tabs and newlines and takes a backslash for a slash", () => {
    expect(safeNext("/\t/evil.example")).toBe("/");
    expect(safeNext("/\n/evil.example")).toBe("/");
    expect(safeNext("/\r/evil.example")).toBe("/");
    expect(safeNext("/\t\\evil.example")).toBe("/");
  });

  it("never returns a path that the browser would read as another site once its dots are resolved", () => {
    expect(safeNext("/.//evil.example")).toBe("/");
    expect(safeNext("/..//evil.example")).toBe("/");
    expect(safeNext("/foo/..//evil.example")).toBe("/");
  });

  it("keeps an ordinary path's query and fragment", () => {
    expect(safeNext("/queue?servicePointId=abc#waiting")).toBe("/queue?servicePointId=abc#waiting");
  });

  it("never comes back to the sign-in page, or to setting up two-step sign-in", () => {
    expect(safeNext("/sign-in")).toBe("/");
    expect(safeNext("/sign-in?next=/facilities")).toBe("/");
    expect(safeNext("/set-up-sign-in?next=/facilities")).toBe("/");
  });
});

describe("asking someone to sign in", () => {
  it("remembers the page they were on", () => {
    expect(signInHref("/facilities")).toBe("/sign-in?next=%2Ffacilities");
  });

  it("asks plainly when they were at home or anywhere outside the app", () => {
    expect(signInHref("/")).toBe("/sign-in");
    expect(signInHref("//example.com")).toBe("/sign-in");
  });
});

describe("asking someone to choose a facility", () => {
  it("remembers the page they were on, as signing in does", () => {
    expect(facilitiesHref("/queue?servicePointId=abc")).toBe("/facilities?next=%2Fqueue%3FservicePointId%3Dabc");
    expect(facilitiesHref("/")).toBe("/facilities");
  });
});

describe("asking someone to set up two-step sign-in", () => {
  it("carries the page they were heading to, to go on to once it is set up", () => {
    expect(setUpSignInHref("/facilities")).toBe("/set-up-sign-in?next=%2Ffacilities");
    expect(setUpSignInHref("/")).toBe("/set-up-sign-in");
  });
});

describe("going to a forgotten password and back", () => {
  it("carries the page they were heading to, so signing in afterwards still lands there", () => {
    expect(forgotPasswordHref("/facilities")).toBe("/forgot-password?next=%2Ffacilities");
    expect(forgotPasswordHref(null)).toBe("/forgot-password");
    expect(forgotPasswordHref("//example.com")).toBe("/forgot-password");
  });
});

describe("reading a query parameter that may repeat", () => {
  it("takes the first of several, as the browser's own URLSearchParams.get does", () => {
    expect(firstParam(["/facilities", "/elsewhere"])).toBe("/facilities");
    expect(firstParam("/facilities")).toBe("/facilities");
    expect(firstParam(undefined)).toBeNull();
    expect(firstParam([])).toBeNull();
  });
});

describe("the record a desk's address names", () => {
  it("is an id, in lower case as the API gives ids", () => {
    expect(idParam("0f6c2b1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f")).toBe("0f6c2b1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f");
    expect(idParam("0F6C2B1E-9A4D-4C3B-8E2F-1A2B3C4D5E6F")).toBe("0f6c2b1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f");
  });

  it("is nothing for anything else", () => {
    for (const value of [null, "", "OP-000412", "0f6c2b1e-9a4d-4c3b-8e2f-1a2b3c4d5e6f/x"])
      expect(idParam(value)).toBeNull();
  });
});
