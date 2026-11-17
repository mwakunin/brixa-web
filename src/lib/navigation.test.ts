import { describe, expect, it } from "vitest";

import { safeNext, signInHref } from "./navigation";

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

  it("never comes back to the sign-in page", () => {
    expect(safeNext("/sign-in")).toBe("/");
    expect(safeNext("/sign-in?next=/facilities")).toBe("/");
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
