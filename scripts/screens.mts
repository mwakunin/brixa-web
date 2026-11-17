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
 * `<desk>@sample-hospital.test` and chooses that person's first facility.
 * Uses the machine's Chromium (`CHROMIUM_PATH`, else /usr/bin/chromium):
 * nothing is downloaded.
 *
 * Writes `screenshots/<page>-<size>.png` and `screenshots/report.json`.
 * Exits 1 if any page has a serious or critical accessibility violation.
 */
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const SIZES = [
  { name: "desktop", width: 1366, height: 768 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "tablet-portrait", width: 768, height: 1024 },
] as const;

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
  const { facilities } = await (await context.request.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string }[] };
  // The facility is chosen as the picker would choose it: its id only, in this browser's storage.
  await context.addInitScript((id) => {
    globalThis.localStorage.setItem("brixa.facilityId", id);
  }, facilities[0].id);
}

await mkdir(OUT, { recursive: true });
const report: { page: string; size: string; file: string; violations: { id: string; impact: string | null | undefined; help: string; nodes: number }[] }[] = [];
for (const route of pages) {
  for (const size of SIZES) {
    const page = await context.newPage();
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`${APP_URL}${route}`, { waitUntil: "networkidle" });
    const file = `${route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replaceAll("/", "_")}-${size.name}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    report.push({ page: route, size: size.name, file, violations: scan.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })) });
    await page.close();
  }
}
await browser.close();

await writeFile(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
const serious = report.flatMap(r => r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => `${r.page} (${r.size}): ${v.id}, ${v.help}`));
console.log(`${report.length} screenshots in ${OUT}`);
for (const line of serious)
  console.log(`  ${line}`);
process.exit(serious.length > 0 ? 1 : 0);
