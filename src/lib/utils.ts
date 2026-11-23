import { createCn } from "cn/config";

/**
 * Tailwind classes merged, a later one winning over an earlier one of its
 * kind. It is told the two type sizes Tailwind lacks (globals.css), which it
 * would otherwise take for colours: `text-name` would lose to
 * `text-foreground`.
 */
export const cn = createCn({ extend: { classGroups: { "font-size": [{ text: ["title", "name"] }] } } });
