import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("merging classes", () => {
  it("keeps the two type sizes of ours beside a text colour", () => {
    expect(cn("text-name font-bold", "text-foreground")).toBe("text-name font-bold text-foreground");
    expect(cn("text-title", "text-status-now")).toBe("text-title text-status-now");
  });

  it("lets a later size win over an earlier one, ours or Tailwind's", () => {
    expect(cn("text-lg", "text-name")).toBe("text-name");
    expect(cn("text-title", "text-sm")).toBe("text-sm");
  });
});
