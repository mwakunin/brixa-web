/**
 * Screenshots of the staff app at the sizes it is built for, with an
 * accessibility scan of each page: how a screen is checked as it is built
 * (CLAUDE.md §7).
 *
 *   pnpm screens /                                   # signed out
 *   pnpm screens --as doctor /                       # signed in as a seeded member of staff
 *   pnpm screens --as frontdesk / /patients/new      # several pages
 *
 * Needs the app running (`pnpm dev`) and, to sign in, the API with its
 * development seed (`pnpm db:seed` in brixa-api): `--as <desk>` signs in as
 * `<desk>@sample-hospital.test`, with the development authenticator's code
 * (`dev-code.mts`), and chooses that person's first facility.
 * Uses the machine's Chromium (`CHROMIUM_PATH`, else /usr/bin/chromium):
 * nothing is downloaded.
 *
 * Reads the app's .env files as `next dev` does, so `NEXT_PUBLIC_API_URL`
 * in `.env.local` is honoured; a value set in the shell wins.
 *
 * Writes `screenshots/<n>-<page>-<size>.png` (n the route's place in the
 * command, so two routes never share a file) and `screenshots/report.json`.
 * Exits 1 if any page answers with an HTTP error (a mistyped route shows a
 * 404 page that would otherwise pass as the screen asked for) or has a
 * serious or critical accessibility violation.
 */
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

import type { paths } from "../src/lib/api/schema";

import { DEV_TOTP_SECRET, totp } from "./dev-code.mts";

/** The facility picker's answer, as the API's own contract says. */
type MyFacilities = paths["/me/facilities"]["get"]["responses"][200]["content"]["application/json"];

const SIZES = [
  { name: "desktop", width: 1366, height: 768 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "tablet-portrait", width: 768, height: 1024 },
] as const;

// The app's own settings, read by Next's own loader as `next dev` reads them: the same files in the same
// order, `$NAME` references expanded, and a value set in the shell winning over them all.
nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, ".."), true, { info: () => {}, error: console.error });

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9999";
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "brixa-dev-password";
const OUT = path.resolve(import.meta.dirname, "../screenshots");

const { values, positionals } = parseArgs({ allowPositionals: true, options: { as: { type: "string" } } });
const pages = positionals.length > 0 ? positionals : ["/"];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium" });
const context = await browser.newContext();

if (values.as) {
  const email = `${values.as}@sample-hospital.test`;
  const signedIn = await context.request.post(`${API_URL}/api/auth/sign-in/email`, { data: { email, password: SEED_PASSWORD }, headers: { origin: APP_URL } });
  if (!signedIn.ok())
    throw new Error(`Signing in as ${email} answered ${signedIn.status()}: is the API running and seeded?`);
  if ((await signedIn.json() as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
    const verified = await context.request.post(`${API_URL}/api/auth/two-factor/verify-totp`, { data: { code: totp(DEV_TOTP_SECRET) }, headers: { origin: APP_URL } });
    if (!verified.ok())
      throw new Error(`The code for ${email} answered ${verified.status()}: was the API seeded before two-step sign-in?`);
  }
  const { facilities } = await (await context.request.get(`${API_URL}/me/facilities`)).json() as MyFacilities;
  // The facility is chosen as the picker would choose it: its id only, in this browser's storage.
  await context.addInitScript((id) => {
    globalThis.localStorage.setItem("brixa.facilityId", id);
  }, facilities[0].id);
}

await mkdir(OUT, { recursive: true });
const report: { page: string; size: string; file: string; status: number | null; violations: { id: string; impact: string | null | undefined; help: string; nodes: number }[] }[] = [];
for (const [index, route] of pages.entries()) {
  const slug = route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replace(/[^\w-]+/g, "_");
  for (const size of SIZES) {
    const page = await context.newPage();
    await page.setViewportSize({ width: size.width, height: size.height });
    const response = await page.goto(`${APP_URL}${route}`, { waitUntil: "networkidle" });
    const file = `${index + 1}-${slug}-${size.name}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    report.push({ page: route, size: size.name, file, status: response?.status() ?? null, violations: scan.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })) });
    await page.close();
  }
}
await browser.close();

await writeFile(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
const httpErrors = report.filter(r => r.status !== null && r.status >= 400).map(r => `${r.page} (${r.size}): HTTP ${r.status}`);
const serious = report.flatMap(r => r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => `${r.page} (${r.size}): ${v.id}, ${v.help}`));
console.log(`${report.length} screenshots in ${OUT}`);
for (const line of [...httpErrors, ...serious])
  console.log(`  ${line}`);
process.exit(httpErrors.length + serious.length > 0 ? 1 : 0);
