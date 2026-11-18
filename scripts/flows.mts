/**
 * The staff app's flows, walked in a real browser against the running API:
 * how a screen is checked to behave, as `pnpm screens` checks how it looks
 * (CLAUDE.md §7).
 *
 *   pnpm flows                        # every flow
 *   pnpm flows sign-in picker         # some, by name
 *
 * Needs the app (`pnpm dev`) and the API with its development seed
 * (`pnpm db:seed` in brixa-api), on this machine, and the machine's Chromium
 * (`CHROMIUM_PATH`, else /usr/bin/chromium). Reads the app's .env files as
 * `next dev` does; a value set in the shell wins.
 *
 * Emails: the development API keeps each email it would have sent as a file
 * in its `.dev-mail/` folder; flows read invitation and reset links from
 * there (`DEV_MAIL_DIR`, else ../api/.dev-mail beside this repository).
 *
 * Data: flows sign in as seeded staff without changing them, and invite
 * made-up people (`flows-…@sample-hospital.test`) into the dev database,
 * whose passwords the reset flow changes. A re-seed clears them.
 *
 * Rate limits: the development API counts every browser request as one
 * address. It allows 10 sign-in and password requests a minute, which a full
 * run exceeds, so the run keeps count, across runs too, and waits for room
 * before a step that needs it, saying so. It also allows 10 sign-ins per account and 10
 * invitation answers every 15 minutes; one run uses half of the second, so
 * two runs fit in 15 minutes. A step that still meets a limit says how long
 * to wait.
 *
 * Exits 1 if any step of any flow fails, naming the flow and the step.
 */
import type { Browser, BrowserContext, Page } from "playwright-core";

import { readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nextEnv from "@next/env";
import path from "node:path";
import { chromium, request } from "playwright-core";

// The app's own settings, read by Next's own loader as `next dev` reads them: the same files in the same
// order, `$NAME` references expanded, and a value set in the shell winning over them all.
nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, ".."), true, { info: () => {}, error: console.error });

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9999";
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "brixa-dev-password";
const DEV_MAIL_DIR = process.env.DEV_MAIL_DIR ?? path.resolve(import.meta.dirname, "../../api/.dev-mail");
const RUN = Date.now().toString(36);

const seeded = (desk: string) => `${desk}@sample-hospital.test`;
const madeUp = (what: string) => `flows-${RUN}-${what}@sample-hospital.test`;

// ---------------------------------------------------------------------------
// Running a flow
// ---------------------------------------------------------------------------

/** The API's rate limit, as last seen by any browser or request in this run: undefined until it answers 429. */
let rateLimited: string | null | undefined;

const limitMessage = (retryAfter: string | null) => `the API's rate limit was reached: wait ${retryAfter ? `${retryAfter} s` : "a few minutes"} and run again`;

/** The API's own limit on sign-in and password requests from one address, less one in hand. */
const AUTH_POSTS_PER_MINUTE = 9;

/**
 * The sign-in and password requests of the last minute. They are kept between
 * runs, in the system's temp folder, so a run started straight after another
 * waits for room rather than meeting the limit. Requests made by hand in a
 * browser are not counted.
 */
const AUTH_POSTS_FILE = path.join(tmpdir(), "brixa-flows-auth-posts.json");
const authPosts: number[] = (() => {
  try {
    return (JSON.parse(readFileSync(AUTH_POSTS_FILE, "utf8")) as number[]).filter(at => Date.now() - at < 60_000).sort((a, b) => a - b);
  }
  catch {
    return [];
  }
})();

/** Notes a sign-in or password request sent to the API, by any browser or request in this run. */
function noteAuthPost(): void {
  authPosts.push(Date.now());
  try {
    writeFileSync(AUTH_POSTS_FILE, JSON.stringify(authPosts));
  }
  catch {
    // Not kept: a run straight after this one may meet the limit, and will say so.
  }
}

/** Waits, if need be, until `needed` more sign-in or password requests fit in the API's minute. */
async function authRoom(needed: number): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (authPosts.length > 0 && now - authPosts[0] >= 60_000)
      authPosts.shift();
    if (authPosts.length + needed <= AUTH_POSTS_PER_MINUTE)
      return;
    const wait = 60_000 - (now - authPosts[authPosts.length + needed - AUTH_POSTS_PER_MINUTE - 1]) + 250;
    console.log(`      … waiting ${Math.ceil(wait / 1000)} s for room under the API's rate limit`);
    await new Promise(resolve => setTimeout(resolve, wait));
  }
}

interface Flow {
  name: string;
  about: string;
  run: (browser: Browser, step: Step) => Promise<void>;
}

type Step = (label: string, check: () => Promise<void>) => Promise<void>;

/** A fresh browser, as a new person at a new desk would have, that notices the API's rate limit. */
async function freshContext(browser: Browser): Promise<{ context: BrowserContext }> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  context.setDefaultTimeout(15_000);
  context.on("request", (sent) => {
    if (sent.method() === "POST" && sent.url().startsWith(`${API_URL}/api/auth/`))
      noteAuthPost();
  });
  context.on("response", (response) => {
    if (response.status() === 429 && response.url().startsWith(API_URL))
      rateLimited = response.headers()["retry-after"] ?? null;
  });
  return { context };
}

/** Fails a step with what was expected, and what was there. */
function expect(what: string, actual: unknown, wanted: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(wanted))
    throw new Error(`${what}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
}

/** The newest link to `linkPath` emailed to `to` since `since`, from the development API's mail folder. */
async function emailedLink(to: string, linkPath: string, since: number): Promise<string> {
  for (let tries = 0; tries < 40; tries++) {
    let names: string[] = [];
    try {
      names = (await readdir(DEV_MAIL_DIR)).filter(name => name.endsWith(".json")).sort().reverse();
    }
    catch {
      // Not made yet: the API has kept no email so far.
    }
    for (const name of names) {
      const mail = JSON.parse(await readFile(path.join(DEV_MAIL_DIR, name), "utf8")) as { to: string; body: string; at: string };
      if (Date.parse(mail.at) < since)
        break;
      const link = mail.to === to ? mail.body.match(new RegExp(`https?://\\S+${linkPath}\\?token=[\\w-]+`))?.[0] : undefined;
      if (link)
        return link;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`no email to ${to} with a ${linkPath} link in ${DEV_MAIL_DIR}. Is the API running in development, with no mail provider?`);
}

async function fillSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${APP_URL}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in, or fails with what the sign-in page said, rather than with a wait that ran out. */
async function signInAs(page: Page, email: string, password: string): Promise<void> {
  await fillSignIn(page, email, password);
  const said = page.getByRole("alert").filter({ hasText: /\S/ }).first();
  await Promise.race([page.waitForURL(url => !url.pathname.startsWith("/sign-in")), said.waitFor()]);
  if (new URL(page.url()).pathname.startsWith("/sign-in"))
    throw new Error(`signing in as ${email} was refused: ${await said.textContent()}`);
}

/**
 * Has the seeded administrator invite `email`, from another computer whose
 * session never reaches the browser, and returns the invitation link.
 */
async function invite(email: string): Promise<string> {
  const since = Date.now();
  const admin = await request.newContext();
  try {
    await authRoom(1);
    noteAuthPost();
    const signedIn = await admin.post(`${API_URL}/api/auth/sign-in/email`, { data: { email: seeded("admin"), password: SEED_PASSWORD }, headers: { origin: APP_URL } });
    if (signedIn.status() === 429)
      rateLimited = signedIn.headers()["retry-after"] ?? null;
    expect("the administrator's sign-in", signedIn.status(), 200);
    const { facilities } = await (await admin.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string }[] };
    const invited = await admin.post(`${API_URL}/staff/invitations`, { data: { name: "Flows Newcomer", email, roles: ["records_clerk"] }, headers: { "x-facility-id": facilities[0].id, "origin": APP_URL } });
    expect("the invitation", invited.status(), 201);
    return await emailedLink(email, "/accept-invitation", since);
  }
  finally {
    await admin.dispose();
  }
}

/** The account the invitation flow made in this run, for the reset flow to use rather than invite another. */
let invitedAccount: { email: string; password: string } | null = null;

const alert = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
const heading = (page: Page) => page.getByRole("heading", { level: 1 });

// ---------------------------------------------------------------------------
// The flows
// ---------------------------------------------------------------------------

const signInFlow: Flow = {
  name: "sign-in",
  about: "the front desk clerk signs in, is refused a wrong password, and signs out",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();

    await step("a signed-out visit to / goes to sign in", async () => {
      await page.goto(`${APP_URL}/`);
      await page.waitForURL("**/sign-in");
    });

    await step("a wrong password keeps the email, clears the password and says so", async () => {
      await authRoom(1);
      await fillSignIn(page, seeded("frontdesk"), "not-the-password");
      await alert(page, "do not match").waitFor();
      expect("the email", await page.getByLabel("Email").inputValue(), seeded("frontdesk"));
      expect("the password", await page.getByLabel("Password").inputValue(), "");
    });

    await step("the right password lands on the desk, with the facility and the person in the header", async () => {
      await authRoom(1);
      await signInAs(page, seeded("frontdesk"), SEED_PASSWORD);
      await page.waitForURL(`${APP_URL}/`);
      await heading(page).waitFor();
      const header = await page.locator("header").innerText();
      if (!header.includes("Sample Hospital") || !header.includes("Joyce Mwangi"))
        throw new Error(`the header reads ${JSON.stringify(header)}`);
    });

    await step("the sign-in page sends someone signed in onward", async () => {
      await page.goto(`${APP_URL}/sign-in`);
      await page.waitForURL(`${APP_URL}/`);
    });

    await step("signing out returns to sign in and forgets the facility chosen at the picker", async () => {
      // Landing at a single facility does not store it, so it is chosen at the picker first, as a returning clerk might.
      await page.goto(`${APP_URL}/facilities`);
      await page.getByRole("button", { name: /^Sample Hospital/ }).click();
      await heading(page).filter({ hasText: "Sample Hospital" }).waitFor();
      if (await page.evaluate(() => localStorage.getItem("brixa.facilityId")) === null)
        throw new Error("choosing at the picker stored no facility, so sign-out has nothing to forget");
      await authRoom(1);
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL("**/sign-in");
      expect("the stored facility", await page.evaluate(() => localStorage.getItem("brixa.facilityId")), null);
      await page.goto(`${APP_URL}/`);
      await page.waitForURL("**/sign-in");
    });

    await context.close();
  },
};

const pickerFlow: Flow = {
  name: "picker",
  about: "the relief clerk, at three facilities, chooses, switches, and works in two tabs",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();

    await step("someone at several open facilities is asked where they are working", async () => {
      await authRoom(1);
      await signInAs(page, seeded("relief"), SEED_PASSWORD);
      await page.waitForURL("**/facilities");
    });

    await step("open facilities come first; the suspended one is last, locked, with why", async () => {
      const items = await page.getByRole("listitem").allInnerTexts();
      expect("the facilities, in order", items.map(item => item.split("\n")[0]), ["Sample Hospital", "Sample Hospital, Westside", "Sample Hospital, East"]);
      if (!items[2].includes("Closed to staff"))
        throw new Error(`the suspended facility reads ${JSON.stringify(items[2])}`);
      expect("buttons for", await page.getByRole("listitem").getByRole("button").count(), 2);
    });

    await step("choosing one lands on its desk, with the roles held there", async () => {
      await page.getByRole("button", { name: /Westside/ }).click();
      await heading(page).filter({ hasText: "Westside" }).waitFor();
      await page.getByText("Records clerk, Cashier").waitFor();
    });

    await step("switching facility from the header, and a reload stays there", async () => {
      await page.getByRole("link", { name: "Switch facility" }).click();
      await page.waitForURL("**/facilities");
      await page.getByRole("button", { name: /^Sample Hospital Records clerk$/ }).click();
      await heading(page).filter({ hasText: /^Sample Hospital$/ }).waitFor();
      await page.reload();
      await heading(page).filter({ hasText: /^Sample Hospital$/ }).waitFor();
    });

    await step("a second tab choosing another facility does not move the first tab's requests", async () => {
      const ids = await (await context.request.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string; name: string }[] };
      const named = (id: string | undefined) => ids.facilities.find(f => f.id === id)?.name ?? id;
      const other = await context.newPage();
      await other.goto(`${APP_URL}/facilities`);
      await other.getByRole("button", { name: /Westside/ }).click();
      await heading(other).filter({ hasText: "Westside" }).waitFor();
      // The first tab asks again once its list is stale (15 s) and the window is looked at.
      await page.waitForTimeout(16_000);
      const sent = page.waitForRequest(request => request.url().endsWith("/me/facilities"));
      await page.bringToFront();
      await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
      expect("the first tab's facility", named((await sent).headers()["x-facility-id"]), "Sample Hospital");
    });

    await context.close();
  },
};

const invitationFlow: Flow = {
  name: "invitation",
  about: "the administrator invites someone new, who accepts and signs in",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();
    const newcomer = madeUp("invited");
    const password = "chosen-password-1";
    let link = "";

    await step("the administrator invites someone new, and the email reaches the mail folder", async () => {
      link = await invite(newcomer);
    });

    await step("two different passwords are caught before anything is sent", async () => {
      await page.goto(link);
      await page.getByLabel("Choose a password").fill(password);
      await page.getByLabel("Type it again").fill("something-else-1");
      await page.getByRole("button", { name: "Accept the invitation" }).click();
      await alert(page, "not the same").waitFor();
      expect("the second field", await page.getByLabel("Type it again").inputValue(), "");
    });

    await step("a new account needs a password, and a short one is refused", async () => {
      await page.getByLabel("Choose a password").fill("");
      await page.getByRole("button", { name: "Accept the invitation" }).click();
      await alert(page, "Choose a password to set up").waitFor();
      await page.getByLabel("Choose a password").fill("short");
      await page.getByLabel("Type it again").fill("short");
      await page.getByRole("button", { name: "Accept the invitation" }).click();
      await alert(page, "at least 10").waitFor();
    });

    await step("accepting sets up the account and says where they can now work", async () => {
      await page.getByLabel("Choose a password").fill(password);
      await page.getByLabel("Type it again").fill(password);
      await page.getByRole("button", { name: "Accept the invitation" }).click();
      await page.getByRole("heading", { name: "Your account is ready" }).waitFor();
      await page.getByText("You can now work at Sample Hospital").waitFor();
    });

    await step("the same link again says it was accepted already", async () => {
      await page.goto(link);
      await page.getByLabel("Choose a password").fill(password);
      await page.getByLabel("Type it again").fill(password);
      await page.getByRole("button", { name: "Accept the invitation" }).click();
      await alert(page, "already been accepted").waitFor();
    });

    await step("a link without a token, or with a made-up one, says so", async () => {
      await page.goto(`${APP_URL}/accept-invitation`);
      await alert(page, "not complete").waitFor();
      await page.goto(`${APP_URL}/accept-invitation?token=${"x".repeat(43)}`);
      await page.getByRole("button", { name: "Accept the invitation" }).click();
      await alert(page, "not valid").waitFor();
    });

    await step("the newcomer signs in with the chosen password", async () => {
      await authRoom(1);
      await signInAs(page, newcomer, password);
      await page.waitForURL(`${APP_URL}/`);
      await heading(page).filter({ hasText: "Sample Hospital" }).waitFor();
      invitedAccount = { email: newcomer, password };
    });

    await context.close();
  },
};

const resetFlow: Flow = {
  name: "reset",
  about: "someone who forgot their password asks for a link and chooses a new one",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();
    const elsewhere = await (await freshContext(browser)).context.newPage();
    let account = invitedAccount;
    const newPassword = "reset-password-1";
    let link = "";

    await step("someone to reset: the newcomer from the invitation flow, or one invited now", async () => {
      if (account)
        return;
      const email = madeUp("reset");
      const password = "chosen-password-1";
      const token = new URL(await invite(email)).searchParams.get("token");
      const accepting = await request.newContext();
      try {
        const answer = await accepting.post(`${API_URL}/invitations/accept`, { data: { token, password }, headers: { origin: APP_URL } });
        if (answer.status() === 429)
          rateLimited = answer.headers()["retry-after"] ?? null;
        expect("accepting the invitation", answer.status(), 200);
      }
      finally {
        await accepting.dispose();
      }
      account = { email, password };
    });
    if (!account)
      return;
    const { email, password } = account;

    await step("asking for a link says the same for an address with no account", async () => {
      await authRoom(1);
      await page.goto(`${APP_URL}/forgot-password`);
      await page.getByLabel("Email").fill(madeUp("nobody"));
      await page.getByRole("button", { name: "Email me a link" }).click();
      await page.getByRole("heading", { name: "Check your email" }).waitFor();
    });

    await step("they are signed in on another device before the reset", async () => {
      await authRoom(1);
      await signInAs(elsewhere, email, password);
      await elsewhere.waitForURL(`${APP_URL}/`);
    });

    await step("asking for a link for their address emails one", async () => {
      await authRoom(1);
      const since = Date.now();
      await page.goto(`${APP_URL}/forgot-password`);
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Email me a link" }).click();
      await page.getByRole("heading", { name: "Check your email" }).waitFor();
      link = await emailedLink(email, "/reset-password", since);
    });

    await step("two different passwords are caught before anything is sent", async () => {
      await page.goto(link);
      await page.getByLabel("New password").fill(newPassword);
      await page.getByLabel("Type it again").fill("something-else-1");
      await page.getByRole("button", { name: "Change my password" }).click();
      await alert(page, "not the same").waitFor();
    });

    await step("the new password is set, and the other device is signed out", async () => {
      await authRoom(1);
      await page.getByLabel("New password").fill(newPassword);
      await page.getByLabel("Type it again").fill(newPassword);
      await page.getByRole("button", { name: "Change my password" }).click();
      await page.getByRole("heading", { name: "Your password is changed" }).waitFor();
      await elsewhere.reload();
      await elsewhere.waitForURL("**/sign-in");
    });

    await step("the used link cannot be used again, and offers a new one", async () => {
      await authRoom(1);
      await page.goto(link);
      await page.getByLabel("New password").fill("another-password-1");
      await page.getByLabel("Type it again").fill("another-password-1");
      await page.getByRole("button", { name: "Change my password" }).click();
      await page.getByRole("heading", { name: "This link cannot be used" }).waitFor();
      await page.getByRole("link", { name: "Ask for a new link" }).waitFor();
    });

    await step("the old password is refused, and the new one signs in", async () => {
      await authRoom(2);
      await fillSignIn(page, email, password);
      await alert(page, "do not match").waitFor();
      await signInAs(page, email, newPassword);
      await page.waitForURL(`${APP_URL}/`);
    });

    await context.close();
    await elsewhere.context().close();
  },
};

const FLOWS = [signInFlow, pickerFlow, invitationFlow, resetFlow];

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const asked = process.argv.slice(2);
const unknown = asked.filter(name => !FLOWS.some(flow => flow.name === name));
if (unknown.length > 0) {
  console.error(`No flow called ${unknown.join(", ")}. The flows: ${FLOWS.map(flow => flow.name).join(", ")}.`);
  process.exit(2);
}
const chosen = asked.length > 0 ? FLOWS.filter(flow => asked.includes(flow.name)) : FLOWS;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium" });
const failed: string[] = [];

for (const flow of chosen) {
  console.log(`\n${flow.name}: ${flow.about}`);
  let stopped = false;
  const step: Step = async (label, check) => {
    if (stopped)
      return;
    const started = Date.now();
    rateLimited = undefined;
    try {
      await check();
      console.log(`  ✓ ${label} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    }
    catch (error) {
      stopped = true;
      const reason = rateLimited !== undefined ? limitMessage(rateLimited) : error instanceof Error ? error.message.split("\n")[0] : String(error);
      console.log(`  ✗ ${label}\n      ${reason}`);
      failed.push(`${flow.name}: ${label}`);
    }
  };
  try {
    await flow.run(browser, step);
  }
  catch (error) {
    failed.push(`${flow.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await browser.close();
console.log(failed.length === 0 ? `\nAll ${chosen.length} flows passed.` : `\n${failed.length} failed:\n${failed.map(line => `  ${line}`).join("\n")}`);
process.exit(failed.length === 0 ? 0 : 1);
