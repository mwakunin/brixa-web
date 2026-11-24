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
 * who set up two-step sign-in and whose passwords the reset flow changes. A
 * re-seed clears them.
 *
 * Codes: every sign-in asks for a code after the password. Seeded staff share
 * the development authenticator, whose code the flows work out
 * (`dev-code.mts`); a made-up person's comes from the setup key they were
 * shown.
 *
 * Rate limits: the development API counts every browser request as one
 * address. It allows 10 sign-in and password requests a minute, which a full
 * run exceeds, so the run keeps count, across runs too, and waits for room
 * before a step that needs it, saying so. Codes have their own, looser limit,
 * and are not counted. It also allows 10 sign-ins per account and 10
 * invitation answers every 15 minutes; one run uses half of the second, so
 * two runs fit in 15 minutes. A step that still meets a limit says how long
 * to wait.
 *
 * Exits 1 if any step of any flow fails, naming the flow and the step.
 */
import type { APIRequestContext, Browser, BrowserContext, Page } from "playwright-core";

import { readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nextEnv from "@next/env";
import path from "node:path";
import { chromium, request } from "playwright-core";

import { DEV_TOTP_SECRET, keyBytes, totp, wrongCode } from "./dev-code.mts";

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

/** The API's own limit on sign-in and password requests from one address, less one in hand. Codes are limited apart. */
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

/** One step of a flow. Once a step has failed the rest are skipped, except clean-up, marked `always`. */
type Step = (label: string, check: () => Promise<void>, options?: { always?: boolean }) => Promise<void>;

/** A fresh browser, as a new person at a new desk would have, that notices the API's rate limit. */
async function freshContext(browser: Browser): Promise<{ context: BrowserContext }> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  context.setDefaultTimeout(15_000);
  context.on("request", (sent) => {
    if (sent.method() === "POST" && sent.url().startsWith(`${API_URL}/api/auth/`) && !sent.url().startsWith(`${API_URL}/api/auth/two-factor/`))
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

/**
 * Signs in: the password, then the code `secret` gives now, when the page
 * asks for one (someone who has not set up two-step sign-in is not asked).
 * Fails with what the page said, rather than with a wait that ran out.
 */
async function signInAs(page: Page, email: string, password: string, secret: string | Uint8Array = DEV_TOTP_SECRET): Promise<void> {
  await fillSignIn(page, email, password);
  const said = page.getByRole("alert").filter({ hasText: /\S/ }).first();
  const askedForCode = page.getByRole("heading", { name: "Enter your code" });
  const left = page.waitForURL(url => !url.pathname.startsWith("/sign-in"));
  await Promise.race([left, said.waitFor(), askedForCode.waitFor()]);
  if (await askedForCode.isVisible()) {
    await page.getByLabel("Code", { exact: true }).fill(totp(secret));
    await page.getByRole("button", { name: "Sign in" }).click();
    await Promise.race([left, said.waitFor()]);
  }
  if (new URL(page.url()).pathname.startsWith("/sign-in"))
    throw new Error(`signing in as ${email} was refused: ${await said.textContent()}`);
}

/** Signs a request context in through the API, as a browser elsewhere would: the password, then the code. */
async function apiSignIn(api: APIRequestContext, email: string, password: string, secret: string | Uint8Array = DEV_TOTP_SECRET): Promise<void> {
  await authRoom(1);
  noteAuthPost();
  const signedIn = await api.post(`${API_URL}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: APP_URL } });
  if (signedIn.status() === 429)
    rateLimited = signedIn.headers()["retry-after"] ?? null;
  expect(`signing in as ${email}`, signedIn.status(), 200);
  if ((await signedIn.json() as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
    const verified = await api.post(`${API_URL}/api/auth/two-factor/verify-totp`, { data: { code: totp(secret) }, headers: { origin: APP_URL } });
    expect(`the code for ${email}`, verified.status(), 200);
  }
}

/**
 * Has the seeded administrator invite `email`, from another computer whose
 * session never reaches the browser, and returns the invitation link.
 */
async function invite(email: string): Promise<string> {
  const since = Date.now();
  const admin = await request.newContext();
  try {
    await apiSignIn(admin, seeded("admin"), SEED_PASSWORD);
    const { facilities } = await (await admin.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string }[] };
    const invited = await admin.post(`${API_URL}/staff/invitations`, { data: { name: "Flows Newcomer", email, roles: ["records_clerk"] }, headers: { "x-facility-id": facilities[0].id, "origin": APP_URL } });
    expect("the invitation", invited.status(), 201);
    return await emailedLink(email, "/accept-invitation", since);
  }
  finally {
    await admin.dispose();
  }
}

/** Someone made up for this run, with two-step sign-in set up: their secret, and the backup codes not yet used. */
interface Newcomer { email: string; password: string; secret: Uint8Array; backupCodes: string[] }

/** The account the invitation flow made in this run, for the later flows to use rather than invite another. */
let invitedAccount: Newcomer | null = null;

/**
 * Someone invited now, who accepts and sets up two-step sign-in through the
 * API, from another computer, for a flow run without the invitation flow.
 */
async function newcomer(what: string): Promise<Newcomer> {
  const email = madeUp(what);
  const password = "chosen-password-1";
  const token = new URL(await invite(email)).searchParams.get("token");
  const elsewhere = await request.newContext();
  try {
    const accepted = await elsewhere.post(`${API_URL}/invitations/accept`, { data: { token, password }, headers: { origin: APP_URL } });
    if (accepted.status() === 429)
      rateLimited = accepted.headers()["retry-after"] ?? null;
    expect("accepting the invitation", accepted.status(), 200);
    await apiSignIn(elsewhere, email, password);
    const enabled = await elsewhere.post(`${API_URL}/api/auth/two-factor/enable`, { data: { password }, headers: { origin: APP_URL } });
    expect("setting up two-step sign-in", enabled.status(), 200);
    const { totpURI, backupCodes } = await enabled.json() as { totpURI: string; backupCodes: string[] };
    const secret = keyBytes(new URL(totpURI).searchParams.get("secret") ?? "");
    const confirmed = await elsewhere.post(`${API_URL}/api/auth/two-factor/verify-totp`, { data: { code: totp(secret) }, headers: { origin: APP_URL } });
    expect("confirming the authenticator", confirmed.status(), 200);
    return { email, password, secret, backupCodes };
  }
  finally {
    await elsewhere.dispose();
  }
}

const alert = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
/** A route's test for an outside request's tests, one function so `unroute` finds the route it set. */
const walkInOrders = (url: URL) => url.pathname.endsWith("/walk-in-orders");
const heading = (page: Page) => page.getByRole("heading", { level: 1 });

/** On the front desk, where a records clerk lands, working where the header says. */
async function atFrontDesk(page: Page, facility = "Sample Hospital"): Promise<void> {
  await page.waitForURL("**/front-desk");
  await page.locator("header").getByText(facility, { exact: true }).waitFor();
}

// ---------------------------------------------------------------------------
// The flows
// ---------------------------------------------------------------------------

const signInFlow: Flow = {
  name: "sign-in",
  about: "the front desk clerk signs in with a password and a code, is refused a wrong one of each, and signs out",
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

    await step("the right password asks for a code; a wrong code is refused and cleared", async () => {
      await authRoom(1);
      await fillSignIn(page, seeded("frontdesk"), SEED_PASSWORD);
      await page.getByRole("heading", { name: "Enter your code" }).waitFor();
      await page.getByLabel("Code", { exact: true }).fill(wrongCode(DEV_TOTP_SECRET));
      await page.getByRole("button", { name: "Sign in" }).click();
      await alert(page, "not right").waitFor();
      expect("the code", await page.getByLabel("Code", { exact: true }).inputValue(), "");
    });

    await step("the right code lands on the front desk, with the facility and the person in the header", async () => {
      await page.getByLabel("Code", { exact: true }).fill(totp(DEV_TOTP_SECRET));
      await page.getByRole("button", { name: "Sign in" }).click();
      await atFrontDesk(page);
      const header = await page.locator("header").innerText();
      if (!header.includes("Sample Hospital") || !header.includes("Joyce Mwangi"))
        throw new Error(`the header reads ${JSON.stringify(header)}`);
    });

    await step("the sign-in page sends someone signed in onward, to their desk", async () => {
      await page.goto(`${APP_URL}/sign-in`);
      await page.waitForURL("**/front-desk");
    });

    await step("signing out returns to sign in and forgets the facility chosen at the picker", async () => {
      // Landing at a single facility does not store it, so it is chosen at the picker first, as a returning clerk might.
      await page.goto(`${APP_URL}/facilities`);
      await page.getByRole("button", { name: /^Sample Hospital/ }).click();
      await atFrontDesk(page);
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

    await step("choosing one lands on the desk for the roles held there", async () => {
      await page.getByRole("button", { name: /Westside/ }).click();
      await atFrontDesk(page, "Sample Hospital, Westside");
    });

    await step("switching facility from the header, and a reload stays there", async () => {
      await page.getByRole("link", { name: "Switch facility" }).click();
      await page.waitForURL("**/facilities");
      await page.getByRole("button", { name: /^Sample Hospital Records clerk$/ }).click();
      await atFrontDesk(page);
      await page.reload();
      await atFrontDesk(page);
    });

    await step("a second tab choosing another facility does not move the first tab's requests", async () => {
      const ids = await (await context.request.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string; name: string }[] };
      const named = (id: string | undefined) => ids.facilities.find(f => f.id === id)?.name ?? id;
      const other = await context.newPage();
      await other.goto(`${APP_URL}/facilities`);
      await other.getByRole("button", { name: /Westside/ }).click();
      await atFrontDesk(other, "Sample Hospital, Westside");
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
  about: "the administrator invites someone new, who accepts, signs in and sets up two-step sign-in",
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

    await step("the newcomer signs in with the chosen password, and is asked to set up two-step sign-in first", async () => {
      await authRoom(1);
      await signInAs(page, newcomer, password);
      await page.waitForURL("**/set-up-sign-in");
      await page.getByRole("heading", { name: "Set up two-step sign-in" }).waitFor();
    });

    await step("a wrong password is refused before anything is set up", async () => {
      await page.getByLabel("Your password").fill("not-the-password");
      await page.getByRole("button", { name: "Continue" }).click();
      await alert(page, "password is not right").waitFor();
      expect("the password", await page.getByLabel("Your password").inputValue(), "");
    });

    let secret: Uint8Array = new Uint8Array();
    await step("the right password shows a code to scan, and a key to type instead", async () => {
      await page.getByLabel("Your password").fill(password);
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("heading", { name: "Add Brixa HMIS to your app" }).waitFor();
      await page.getByRole("img", { name: "A code for your authenticator app to scan" }).waitFor();
      secret = keyBytes(await page.locator("code").innerText());
    });

    let backupCodes: string[] = [];
    await step("a wrong first code is refused; the right one shows ten backup codes", async () => {
      await page.getByLabel("Code from the app").fill(wrongCode(secret));
      await page.getByRole("button", { name: "Confirm" }).click();
      await alert(page, "code is not right").waitFor();
      await page.getByLabel("Code from the app").fill(totp(secret));
      await page.getByRole("button", { name: "Confirm" }).click();
      await page.getByRole("heading", { name: "Keep your backup codes" }).waitFor();
      backupCodes = await page.getByRole("list", { name: "Your backup codes" }).getByRole("listitem").allInnerTexts();
      expect("how many backup codes", backupCodes.length, 10);
    });

    await step("keeping them goes on to the desk", async () => {
      await page.getByRole("button", { name: "I have kept them" }).click();
      await atFrontDesk(page);
      invitedAccount = { email: newcomer, password, secret, backupCodes };
    });

    await context.close();
  },
};

const twoStepFlow: Flow = {
  name: "two-step",
  about: "someone without their phone signs in with a backup code, which then works no more",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();
    let account = invitedAccount;

    await step("someone with two-step sign-in set up: the newcomer from the invitation flow, or one set up now", async () => {
      account ??= await newcomer("two-step");
    });
    if (!account)
      return;
    const { email, password } = account;
    const backupCode = account.backupCodes.shift()!;

    await step("a backup code signs in in place of the app's code, typed with a space for its hyphen", async () => {
      await authRoom(1);
      await fillSignIn(page, email, password);
      await page.getByRole("button", { name: "Use a backup code instead" }).click();
      await page.getByLabel("Backup code").fill(backupCode.replace("-", " "));
      await page.getByRole("button", { name: "Sign in" }).click();
      await atFrontDesk(page);
    });

    await step("the same backup code is refused the next time", async () => {
      await authRoom(2);
      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL("**/sign-in");
      await fillSignIn(page, email, password);
      await page.getByRole("button", { name: "Use a backup code instead" }).click();
      await page.getByLabel("Backup code").fill(backupCode);
      await page.getByRole("button", { name: "Sign in" }).click();
      await alert(page, "used already").waitFor();
    });

    await step("starting again goes back to the password, keeping the email", async () => {
      await page.getByRole("button", { name: "Start again" }).click();
      await page.getByRole("heading", { name: "Sign in" }).waitFor();
      expect("the email", await page.getByLabel("Email").inputValue(), email);
      expect("the password", await page.getByLabel("Password").inputValue(), "");
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
      account ??= await newcomer("reset");
    });
    if (!account)
      return;
    const person = account;
    const { email, password, secret } = person;

    await step("asking for a link says the same for an address with no account", async () => {
      await authRoom(1);
      await page.goto(`${APP_URL}/forgot-password`);
      await page.getByLabel("Email").fill(madeUp("nobody"));
      await page.getByRole("button", { name: "Email me a link" }).click();
      await page.getByRole("heading", { name: "Check your email" }).waitFor();
    });

    await step("they are signed in on another device before the reset", async () => {
      await authRoom(1);
      await signInAs(elsewhere, email, password, secret);
      await atFrontDesk(elsewhere);
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
      // Its session ended there, not by signing out, so sign-in brings it back to the desk it was on.
      await elsewhere.waitForURL(url => url.pathname === "/sign-in" && url.searchParams.get("next") === "/front-desk");
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
      await signInAs(page, email, newPassword, secret);
      await atFrontDesk(page);
      // The new password is the one to use from now on, for a flow after this one.
      person.password = newPassword;
    });

    await context.close();
    await elsewhere.context().close();
  },
};

const frontDeskFlow: Flow = {
  name: "front-desk",
  about: "the clerk finds a patient, starts their visit through a dropped answer, sends them on as an emergency, enters an outside request's tests, and checks in a booking",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();
    const search = page.getByRole("searchbox", { name: "Find a patient" });
    // Someone made up for this run, found by a family name no one else has.
    const familyName = `Flows${RUN}`;
    const name = `Amani ${familyName}`;
    const idNumber = String(Date.now()).slice(-8);
    const match = page.getByRole("button", { name: new RegExp(`^${name}`) });
    let facilityId = "";
    let patientId = "";
    let bookedId = "";
    let readsBeforeRetry = 0;

    const visitsOf = async (id: string) => (await (await context.request.get(`${API_URL}/encounters?patientId=${id}`, { headers: { "x-facility-id": facilityId } })).json() as { encounters: { id: string; kind: string; status: string }[] }).encounters;
    // Opening a record, or the list of a patient's visits, is an audited read: the page makes none until asked.
    const recordReads: string[] = [];
    // Every write the page sends to the API.
    const writes: string[] = [];
    page.on("request", (sent) => {
      const url = new URL(sent.url());
      if (url.origin !== new URL(API_URL).origin)
        return;
      if (sent.method() === "GET" && (/^\/patients\/[\w-]+$/.test(url.pathname) || url.pathname === "/encounters"))
        recordReads.push(url.pathname + url.search);
      if (sent.method() === "POST" && !url.pathname.startsWith("/api/auth/"))
        writes.push(url.pathname);
    });

    await step("the clerk lands on the front desk, named in the header, with nobody chosen", async () => {
      await authRoom(1);
      await signInAs(page, seeded("frontdesk"), SEED_PASSWORD);
      await atFrontDesk(page);
      await page.locator("header").getByText("Front desk", { exact: true }).waitFor();
      await heading(page).filter({ hasText: "Nobody chosen yet" }).waitFor();
    });

    await step("a made-up patient is registered through the API, in the clerk's session", async () => {
      const { facilities } = await (await context.request.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string; name: string }[] };
      facilityId = facilities.find(facility => facility.name === "Sample Hospital")?.id ?? "";
      const registered = await context.request.post(`${API_URL}/patients`, {
        headers: { "x-facility-id": facilityId, "origin": APP_URL },
        data: { givenName: "Amani", familyName, sex: "female", dateOfBirth: "1990-04-12", noPhoneReason: "no_phone", identifiers: [{ type: "national_id", value: idNumber }] },
      });
      expect("registering the patient", registered.status(), 201);
      patientId = (await registered.json() as { id: string }).id;
    });

    await step("a search shows each match with its sex, age, phone and ID, and opens no record, even on hover", async () => {
      await search.fill(familyName);
      await match.waitFor();
      const line = await match.innerText();
      if (!/Female · \d+ years · no phone/.test(line) || !line.includes(`ID ${idNumber}`))
        throw new Error(`the match reads ${JSON.stringify(line)}`);
      await match.hover();
      await page.waitForTimeout(1_000);
      expect("records read before choosing", recordReads, []);
    });

    await step("choosing the match opens the record, which says they have not been here before", async () => {
      await match.click();
      await heading(page).filter({ hasText: name }).waitFor();
      await page.getByText("Not here before").waitFor();
      expect("the address", new URL(page.url()).search, `?patient=${patientId}`);
      expect("the match, marked chosen", await match.getAttribute("aria-pressed"), "true");
    });

    await step("a lost answer holds the visit; Try again resends its key, and the API answers with its first answer", async () => {
      const keys: string[] = [];
      let answerLost = false;
      await page.route(`${API_URL}/encounters`, async (route) => {
        if (route.request().method() !== "POST")
          return route.continue();
        keys.push(route.request().headers()["idempotency-key"] ?? "");
        if (answerLost)
          return route.continue();
        answerLost = true;
        // The visit is opened, but its answer never reaches the page.
        await route.fetch();
        await route.abort("connectionreset");
      });
      await page.getByRole("button", { name: "Start today's visit" }).click();
      await alert(page, "No answer: the connection dropped").waitFor();
      // Another patient chosen meanwhile, and this one again: the visit still waits for its answer, with only Try again.
      await search.fill("Amina Njeri");
      await page.getByRole("button", { name: /^Amina Njeri/ }).click();
      await heading(page).filter({ hasText: "Amina Njeri" }).waitFor();
      await search.fill(familyName);
      await match.click();
      await alert(page, "No answer: the connection dropped").waitFor();
      expect("the Emergency button, while an answer is awaited", await page.getByRole("button", { name: "Emergency" }).count(), 0);
      const second = page.waitForResponse(response => response.url() === `${API_URL}/encounters` && response.request().method() === "POST");
      // Counted from before Try again, so a read the answer set off is not hidden in the count.
      readsBeforeRetry = recordReads.length;
      await page.getByRole("button", { name: "Try again: start today's visit" }).click();
      expect("the answer, replayed", (await second).headers()["idempotent-replayed"], "true");
      expect("one key, sent twice", keys.length === 2 && keys[0] === keys[1] && keys[0].length >= 8, true);
      await page.getByRole("status").filter({ hasText: `${name} is in the Triage queue.` }).waitFor();
      await page.unroute(`${API_URL}/encounters`);
    });

    await step("the visit was opened once; the record says where the patient waits, without reading it again", async () => {
      const reads = readsBeforeRetry;
      await page.getByText(/^Outpatient visit, waiting at Triage since \d\d:\d\d$/).waitFor();
      expect("records read since", recordReads.length, reads);
      expect("visits opened", (await visitsOf(patientId)).map(visit => [visit.kind, visit.status]), [["opd", "open"]]);
    });

    await step("Find the next patient empties the search and the panel, and puts the cursor in the search", async () => {
      await page.getByRole("button", { name: "Find the next patient" }).click();
      await heading(page).filter({ hasText: "Nobody chosen yet" }).waitFor();
      expect("the search", await search.inputValue(), "");
      expect("the cursor in the search", await search.evaluate(input => input === document.activeElement), true);
      expect("the address", new URL(page.url()).search, "");
    });

    await step("a patient with a visit open is sent on with Emergency, as an emergency", async () => {
      await search.fill(familyName);
      await match.click();
      await page.getByText(`${name} has a visit open already.`).waitFor();
      await page.getByRole("button", { name: "Emergency" }).click();
      await page.getByRole("status").filter({ hasText: new RegExp(`^${name} is in the .+ queue, as an emergency\\.`) }).waitFor();
    });

    await step("a second emergency is refused in the API's own words, beside the button", async () => {
      await page.getByRole("button", { name: "Find the next patient" }).click();
      await search.fill(familyName);
      await match.click();
      await page.getByText(`${name} has a visit open already.`).waitFor();
      await page.getByRole("button", { name: "Emergency" }).click();
      await alert(page, "Not done").filter({ hasText: "already has an open visit of that kind" }).waitFor();
      expect("visits opened", (await visitsOf(patientId)).map(visit => visit.kind).sort(), ["emergency", "opd"]);
    });

    const cancelOpenVisits = async (id: string) => {
      if (!id)
        return;
      for (const visit of (await visitsOf(id)).filter(visit => visit.status === "open")) {
        const cancelled = await context.request.post(`${API_URL}/encounters/${visit.id}/cancel`, { headers: { "x-facility-id": facilityId, "origin": APP_URL }, data: { reason: "Opened by pnpm flows" } });
        expect(`cancelling the ${visit.kind} visit`, cancelled.status(), 200);
      }
    };

    await step("the visits opened are cancelled, so no queue keeps a made-up patient", async () => {
      await cancelOpenVisits(patientId);
    });

    let testItems: string[] = [];
    await step("an outside request's tests: what is missing is marked, and nothing is sent", async () => {
      await page.getByRole("button", { name: "Find the next patient" }).click();
      await search.fill(familyName);
      await match.click();
      await page.getByText("Not here before").waitFor();
      await page.getByRole("button", { name: "Tests only, from an outside doctor's request" }).click();
      await page.getByRole("heading", { name: "Tests from an outside request" }).waitFor();
      const sent = writes.length;
      await page.getByRole("button", { name: `Send ${name} to the lab` }).click();
      await page.getByText("Give the doctor's name, or tick that the patient asks for the tests.").waitFor();
      await page.getByText("Choose at least one test.").waitFor();
      expect("writes sent meanwhile", writes.slice(sent), []);
    });

    await step("a lost answer is tried again under the one key, and the patient goes to the lab in no queue", async () => {
      await page.getByLabel("Doctor's name").fill("Dr Flows");
      await page.getByLabel("Their hospital or clinic").fill("Riverside Clinic");
      await page.getByRole("checkbox", { name: /^Malaria rapid test/ }).check();
      const keys: Record<string, string[]> = { visit: [], tests: [] };
      let answerLost = false;
      // Kept, as `unroute` removes only the route registered with this same function.
      const visitOrTests = (url: URL) => url.href === `${API_URL}/encounters` || /\/encounters\/[\w-]+\/walk-in-orders$/.test(url.pathname);
      await page.route(visitOrTests, async (route) => {
        if (route.request().method() !== "POST")
          return route.continue();
        const tests = route.request().url().endsWith("/walk-in-orders");
        keys[tests ? "tests" : "visit"].push(route.request().headers()["idempotency-key"] ?? "");
        if (!tests || answerLost)
          return route.continue();
        answerLost = true;
        // The visit is opened and the tests entered, but the answer never reaches the page. Their ids are
        // kept from it now, so clean-up cancels them even if a later check fails.
        const answered = await route.fetch();
        testItems = (await answered.json() as { items: { id: string }[] }).items.map(item => item.id);
        await route.abort("connectionreset");
      });
      await page.getByRole("button", { name: `Enter 1 test and send ${name} to the lab` }).click();
      await alert(page, "No answer: the connection dropped").waitFor();
      const replayed = page.waitForResponse(response => response.url().endsWith("/walk-in-orders") && response.request().method() === "POST");
      await page.getByRole("button", { name: "Try again: enter the tests" }).click();
      const answer = await replayed;
      expect("the tests' answer, replayed", answer.headers()["idempotent-replayed"], "true");
      expect("the tests replayed, as first entered", (await answer.json() as { items: { id: string }[] }).items.map(item => item.id), testItems);
      await page.unroute(visitOrTests);
      const [first] = keys.visit;
      expect("one key for the action, sent twice for each request", [keys.visit.length, keys.tests.length, keys.visit[1] === first, keys.tests[1] === keys.tests[0], first.endsWith(".visit"), keys.tests[0] === `${first.slice(0, -".visit".length)}.tests`], [2, 2, true, true, true, true]);
      await page.getByRole("status").filter({ hasText: `${name} can go to the lab: 1 test is entered.` }).waitFor();
      await page.getByText(/^Outpatient visit, open since \d\d:\d\d, in no queue$/).waitFor();
      expect("visits open", (await visitsOf(patientId)).filter(visit => visit.status === "open").length, 1);
    });

    await step("an outside request still sending when its patient is left ends, once chosen again, in its Done, not its form", async () => {
      await page.getByRole("button", { name: "Find the next patient" }).click();
      await search.fill(familyName);
      await match.click();
      await page.getByRole("button", { name: "Tests only, from an outside doctor's request" }).click();
      await page.getByLabel("Doctor's name").fill("Dr Flows");
      await page.getByLabel("Their hospital or clinic").fill("Riverside Clinic");
      await page.getByRole("checkbox", { name: /^Full blood count/ }).check();
      // The tests' answer is held back until the clerk has left the patient and come back.
      let release = () => {};
      const held = new Promise<void>(resolve => (release = resolve));
      await page.route(walkInOrders, async (route) => {
        if (route.request().method() !== "POST")
          return route.continue();
        const answered = await route.fetch();
        testItems.push(...(await answered.json() as { items: { id: string }[] }).items.map(item => item.id));
        await held;
        await route.fulfill({ response: answered });
      });
      try {
        await page.getByRole("button", { name: `Enter 1 test and send ${name} to the lab` }).click();
        await search.fill("Amina Njeri");
        await page.getByRole("button", { name: /^Amina Njeri/ }).click();
        await heading(page).filter({ hasText: "Amina Njeri" }).waitFor();
        await search.fill(familyName);
        await match.click();
        await page.getByRole("button", { name: "Entering the tests…" }).waitFor();
      }
      finally {
        // Let the answer through even if a check failed, so the tests' ids reach clean-up.
        release();
      }
      await page.getByRole("status").filter({ hasText: `${name} can go to the lab: 1 test is entered.` }).waitFor();
      await page.unroute(walkInOrders);
      expect("the form, to send a second time", await page.getByRole("heading", { name: "Tests from an outside request" }).count(), 0);
    });

    await step("an outside request answered while its patient was left shows its Done when chosen again, not its form", async () => {
      await page.getByRole("button", { name: "Find the next patient" }).click();
      await search.fill(familyName);
      await match.click();
      await page.getByRole("button", { name: "Tests only, from an outside doctor's request" }).click();
      await page.getByLabel("Doctor's name").fill("Dr Flows");
      await page.getByLabel("Their hospital or clinic").fill("Riverside Clinic");
      await page.getByRole("checkbox", { name: /^Malaria rapid test/ }).check();
      // The answer is held back until the clerk is on another patient, then let through while they are away.
      let release = () => {};
      const held = new Promise<void>(resolve => (release = resolve));
      await page.route(walkInOrders, async (route) => {
        if (route.request().method() !== "POST")
          return route.continue();
        const answered = await route.fetch();
        testItems.push(...(await answered.json() as { items: { id: string }[] }).items.map(item => item.id));
        await held;
        await route.fulfill({ response: answered });
      });
      try {
        await page.getByRole("button", { name: `Enter 1 test and send ${name} to the lab` }).click();
        await search.fill("Amina Njeri");
        await page.getByRole("button", { name: /^Amina Njeri/ }).click();
        await heading(page).filter({ hasText: "Amina Njeri" }).waitFor();
      }
      finally {
        release();
      }
      await page.waitForResponse(response => response.url().endsWith("/walk-in-orders") && response.request().method() === "POST");
      await page.unroute(walkInOrders);
      await search.fill(familyName);
      await match.click();
      await page.getByRole("status").filter({ hasText: `${name} can go to the lab: 1 test is entered.` }).waitFor();
      expect("the form, to send a second time", await page.getByRole("heading", { name: "Tests from an outside request" }).count(), 0);
    });

    await step("a booking for today is checked in with one press, and says so", async () => {
      const { servicePoints } = await (await context.request.get(`${API_URL}/service-points`, { headers: { "x-facility-id": facilityId } })).json() as { servicePoints: { id: string; kind: string }[] };
      const clinic = servicePoints.find(point => point.kind === "consultation")?.id;
      const booked = await context.request.post(`${API_URL}/patients`, {
        headers: { "x-facility-id": facilityId, "origin": APP_URL },
        data: { givenName: "Zawadi", familyName, sex: "female", dateOfBirth: "1985-08-02", noPhoneReason: "no_phone", noIdReason: "not_carried" },
      });
      expect("registering the booked patient", booked.status(), 201);
      bookedId = (await booked.json() as { id: string }).id;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
      const appointment = await context.request.post(`${API_URL}/appointments`, { headers: { "x-facility-id": facilityId, "origin": APP_URL }, data: { patientId: bookedId, servicePointId: clinic, date: today, time: "23:59" } });
      expect("booking for today", appointment.status(), 201);
      await page.goto(`${APP_URL}/front-desk`);
      const row = page.getByRole("listitem").filter({ hasText: `Zawadi ${familyName}` });
      await row.getByText("23:59 · ").waitFor();
      await row.getByRole("button", { name: "Check in" }).click();
      await row.getByText("Checked in").waitFor();
      const { appointments } = await (await context.request.get(`${API_URL}/appointments?date=${today}`, { headers: { "x-facility-id": facilityId } })).json() as { appointments: { patient: { id: string }; status: string; encounterId: string | null }[] };
      const checked = appointments.find(listed => listed.patient.id === bookedId);
      expect("the booking, checked in with a visit", [checked?.status, Boolean(checked?.encounterId)], ["checked_in", true]);
    });

    await step("the tests and the visits opened are cancelled, so no list keeps a made-up patient", async () => {
      for (const item of testItems) {
        const cancelled = await context.request.post(`${API_URL}/order-items/${item}/cancel`, { headers: { "x-facility-id": facilityId, "origin": APP_URL }, data: { reason: "Entered by pnpm flows" } });
        expect("cancelling a test", cancelled.status(), 200);
      }
      await cancelOpenVisits(patientId);
      await cancelOpenVisits(bookedId);
    }, { always: true });

    await context.close();
  },
};

const registerFlow: Flow = {
  name: "register",
  about: "the clerk registers a child with a guardian through a lost answer, meets a likely duplicate, and registers an unidentified patient as an emergency",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();
    const search = page.getByRole("searchbox", { name: "Find a patient" });
    // A made-up child, found by a family name no one else has: letters only, as a search for a name is.
    const familyName = `Flows${RUN.replace(/\d/g, digit => "abcdefghij"[Number(digit)])}`;
    const name = `Baraka ${familyName}`;
    const born = String(new Date().getFullYear() - 4);
    let facilityId = "";
    const keys: string[] = [];
    const posted = () => keys.length;
    page.on("request", (sent) => {
      if (sent.method() === "POST" && sent.url() === `${API_URL}/patients`)
        keys.push(sent.headers()["idempotency-key"] ?? "");
    });
    // Every patient registered, as the API answers, so clean-up finds them even if a later check fails.
    const registered: string[] = [];
    page.on("response", (answer) => {
      if (answer.request().method() === "POST" && answer.url() === `${API_URL}/patients` && answer.status() === 201)
        void answer.json().then((record: { id: string }) => registered.push(record.id), () => {});
    });
    const api = (path: string) => context.request.get(`${API_URL}${path}`, { headers: { "x-facility-id": facilityId } });
    const found = async () => (await (await api(`/patients?q=${familyName}`)).json() as { patients: { id: string }[] }).patients;
    const register = page.getByRole("button", { name: "Not here? Register a new patient" });

    /** Fills in the child as the clerk would: names, sex, date of birth, and why there is no phone or ID. */
    async function fillChild(): Promise<void> {
      await page.getByLabel("First name").fill("Baraka");
      await page.getByLabel("Family name").fill(familyName);
      await page.getByRole("button", { name: "Male", exact: true }).click();
      await page.getByLabel("Day", { exact: true }).fill("10");
      await page.getByLabel("Month", { exact: true }).fill("3");
      await page.getByLabel("Year", { exact: true }).fill(born);
      await page.getByLabel("Has no phone").check();
      await page.getByLabel("Has none, such as a young child").check();
    }

    await step("the clerk lands on the front desk", async () => {
      await authRoom(1);
      await signInAs(page, seeded("frontdesk"), SEED_PASSWORD);
      await atFrontDesk(page);
      const { facilities } = await (await context.request.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string; name: string }[] };
      facilityId = facilities.find(facility => facility.name === "Sample Hospital")?.id ?? "";
    });

    await step("a search that finds nobody leads to registering, with the name searched for typed in", async () => {
      await search.fill(name);
      await page.getByText(`Nobody found for “${name}”`).waitFor();
      await register.click();
      await heading(page).filter({ hasText: "New patient" }).waitFor();
      expect("the names", [await page.getByLabel("First name").inputValue(), await page.getByLabel("Family name").inputValue()], ["Baraka", familyName]);
      expect("the address", new URL(page.url()).search, "?new");
    });

    await step("what is missing is marked at each field, and nothing is sent", async () => {
      await page.getByRole("button", { name: "Register and start today's visit" }).click();
      await alert(page, "see the marked fields").waitFor();
      for (const said of ["Choose the sex.", "Give the date of birth, or about how old.", "Give a phone number, or tick that the patient has none.", "Give an ID number, or tick why there is none."])
        await page.getByText(said).waitFor();
      expect("registrations sent", posted(), 0);
    });

    await step("a child with a guardian: a lost answer holds the form, and Try again registers once and starts the visit", async () => {
      await fillChild();
      await page.getByRole("button", { name: "Add a guardian" }).click();
      const guardian = page.getByRole("group", { name: "Guardian 1" });
      await guardian.getByLabel("Name", { exact: true }).fill("Grace Flows");
      await guardian.getByLabel("Relationship").fill("Mother");
      await guardian.getByLabel("Phone").fill("0711 000 111");
      let answerLost = false;
      await page.route(`${API_URL}/patients`, async (route) => {
        if (route.request().method() !== "POST" || answerLost)
          return route.continue();
        answerLost = true;
        // The patient is registered, but the answer never reaches the page.
        await route.fetch();
        await route.abort("connectionreset");
      });
      await page.getByRole("button", { name: "Register and start today's visit" }).click();
      await alert(page, "No answer: the connection dropped").waitFor();
      // Left with the browser's Back and opened again: the registration still waits, held as it was sent.
      await page.goBack();
      await register.click();
      await alert(page, "No answer: the connection dropped").waitFor();
      expect("the form, held as sent", [await page.getByLabel("First name").isDisabled(), await page.getByLabel("Family name").inputValue()], [true, familyName]);
      const second = page.waitForResponse(response => response.url() === `${API_URL}/patients` && response.request().method() === "POST");
      await page.getByRole("button", { name: "Try again: register and start today's visit" }).click();
      expect("the answer, replayed", (await second).headers()["idempotent-replayed"], "true");
      expect("one key, sent twice", keys.length === 2 && keys[0] === keys[1], true);
      await page.unroute(`${API_URL}/patients`);
      await page.getByRole("status").filter({ hasText: `${name} is in the Triage queue.` }).waitFor();
      await page.getByText(/^Registered as \S+, and started at \d\d:\d\d\.$/).waitFor();
      const patients = await found();
      expect("patients registered", patients.length, 1);
      const record = await (await api(`/patients/${patients[0].id}`)).json() as { contacts: { name: string; relationship: string; phone: string }[] };
      expect("the guardian", record.contacts.map(contact => [contact.name, contact.relationship, contact.phone]), [["Grace Flows", "Mother", "+254711000111"]]);
    });

    await step("registering the child again meets the likely duplicate, whose record opens", async () => {
      await page.getByRole("button", { name: "Find the next patient" }).click();
      await register.click();
      await fillChild();
      await page.getByRole("button", { name: "Register only" }).click();
      await page.getByRole("heading", { name: "Is this the same person?" }).waitFor();
      await page.getByRole("button", { name: "Yes, open this record" }).click();
      await heading(page).filter({ hasText: name }).waitFor();
      const patients = await found();
      expect("the record opened", new URL(page.url()).search, `?patient=${patients[0].id}`);
      expect("patients registered", patients.length, 1);
    });

    await step("saying it is someone else registers another of that name, as the clerk asked", async () => {
      await page.getByRole("button", { name: "Find the next patient" }).click();
      await register.click();
      await fillChild();
      await page.getByRole("button", { name: "Register only" }).click();
      await page.getByRole("button", { name: "No, this is someone else" }).click();
      await page.getByRole("status").filter({ hasText: new RegExp(`^${name} is registered, as \\S+\\.$`) }).waitFor();
      await page.getByRole("button", { name: "Start today's visit" }).waitFor();
      expect("patients registered", (await found()).length, 2);
    });

    await step("someone who cannot say who they are is registered as an emergency, under a placeholder name", async () => {
      await search.fill(familyName);
      await register.click();
      await page.getByRole("button", { name: "Register an unidentified patient" }).click();
      await heading(page).filter({ hasText: "Unidentified patient" }).waitFor();
      await page.getByRole("button", { name: "Male", exact: true }).click();
      await page.getByLabel("About how old, in years").fill("30");
      await page.getByRole("button", { name: "Register as an emergency" }).click();
      // An earlier run's "Unknown Male" of the same age is a likely duplicate: this is someone else.
      const done = page.getByRole("status").filter({ hasText: /^Unknown Male is in the .+ queue, as an emergency\./ });
      const same = page.getByRole("button", { name: "No, this is someone else" });
      await Promise.race([done.waitFor(), same.waitFor()]);
      if (await same.isVisible())
        await same.click();
      await done.waitFor();
    });

    await step("the visits opened are cancelled, so no queue keeps a made-up patient", async () => {
      // Signing in failed: nothing was made.
      if (!facilityId)
        return;
      const ids = new Set([...(await found()).map(patient => patient.id), ...registered]);
      for (const id of ids) {
        const { encounters } = await (await api(`/encounters?patientId=${id}`)).json() as { encounters: { id: string; status: string }[] };
        for (const visit of encounters.filter(visit => visit.status === "open")) {
          const cancelled = await context.request.post(`${API_URL}/encounters/${visit.id}/cancel`, { headers: { "x-facility-id": facilityId, "origin": APP_URL }, data: { reason: "Opened by pnpm flows" } });
          expect("cancelling a visit", cancelled.status(), 200);
        }
      }
    }, { always: true });

    await context.close();
  },
};

const cashierFlow: Flow = {
  name: "cashier",
  about: "the cashier sees who has money due, opens a patient's bill, takes part in cash, asks for a waiver, uses credit and takes the rest of what the patient owes, and closes the shift",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();
    // The front desk, at another computer: it sends a made-up patient to the lab, so a visit has money due.
    const clerk = await request.newContext();
    const familyName = `Flows${RUN}`;
    const name = `Neema ${familyName}`;
    const row = page.getByRole("button", { name: new RegExp(`^${name}`) });
    let facilityId = "";
    let visitId = "";
    let patientId = "";
    let waiverId = "";
    let testItems: string[] = [];
    let paid = false;
    const asClerk = { "x-facility-id": "", "origin": APP_URL };
    // A visit's bill is part of the patient's record, and reading it is audited: the page reads none until one is chosen.
    const billReads: string[] = [];
    page.on("request", (sent) => {
      const url = new URL(sent.url());
      if (url.origin === new URL(API_URL).origin && sent.method() === "GET" && /^\/encounters\/[\w-]+\/charges$/.test(url.pathname))
        billReads.push(url.pathname);
    });
    // What the API's list of money due says of the made-up visit. The list comes oldest first, 200 at a time, so pages are read until it is found or the list ends.
    const dueOnVisit = async (): Promise<{ encounterId: string; dueCents: number } | undefined> => {
      for (let offset = 0; ;) {
        const answered = await context.request.get(`${API_URL}/cashier/due?offset=${offset}`, { headers: { "x-facility-id": facilityId } });
        expect("reading the list of money due", answered.status(), 200);
        const { visits } = await answered.json() as { visits: { encounterId: string; dueCents: number }[] };
        const visit = visits.find(due => due.encounterId === visitId);
        if (visit || visits.length < 200)
          return visit;
        offset += visits.length;
      }
    };

    await step("the front desk sends a made-up patient to the lab with tests they asked for, which are charged", async () => {
      await apiSignIn(clerk, seeded("frontdesk"), SEED_PASSWORD);
      const { facilities } = await (await clerk.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string; name: string }[] };
      facilityId = facilities.find(facility => facility.name === "Sample Hospital")?.id ?? "";
      asClerk["x-facility-id"] = facilityId;
      const registered = await clerk.post(`${API_URL}/patients`, { headers: asClerk, data: { givenName: "Neema", familyName, sex: "female", dateOfBirth: "1993-02-17", noPhoneReason: "no_phone", noIdReason: "not_carried" } });
      expect("registering the patient", registered.status(), 201);
      patientId = (await registered.json() as { id: string }).id;
      const opened = await clerk.post(`${API_URL}/encounters`, { headers: asClerk, data: { patientId, kind: "opd", queueAt: null } });
      expect("opening the visit", opened.status(), 201);
      visitId = (await opened.json() as { id: string }).id;
      const { tests } = await (await clerk.get(`${API_URL}/lab-tests`, { headers: { "x-facility-id": facilityId } })).json() as { tests: { id: string; name: string }[] };
      const malaria = tests.find(test => test.name === "Malaria rapid test");
      const entered = await clerk.post(`${API_URL}/encounters/${visitId}/walk-in-orders`, { headers: asClerk, data: { selfRequested: true, labTestIds: [malaria?.id] } });
      expect("entering the test", entered.status(), 201);
      testItems = (await entered.json() as { items: { id: string }[] }).items.map(item => item.id);
    });

    await step("the cashier lands on the cashier's desk, named in the header, with nobody chosen", async () => {
      await authRoom(1);
      await signInAs(page, seeded("cashier"), SEED_PASSWORD);
      await page.waitForURL("**/cashier");
      await page.locator("header").getByText("Cashier", { exact: true }).waitFor();
      await heading(page).filter({ hasText: "Nobody chosen yet" }).waitFor();
    });

    await step("the money due list names the patient with what is due, and no bill is read before one is chosen", async () => {
      await row.waitFor();
      expect("the amount due on the row", await row.getByText(/^KES /).innerText(), "KES 300");
      await row.hover();
      await page.waitForTimeout(1_000);
      expect("bills read before choosing", billReads, []);
    });

    await step("choosing the patient opens their bill: who, which visit, each line, and what is to pay", async () => {
      await row.click();
      await heading(page).filter({ hasText: name }).waitFor();
      expect("the address", new URL(page.url()).search, `?visit=${visitId}`);
      expect("the row, marked chosen", await row.getAttribute("aria-pressed"), "true");
      await page.getByText(/· today's outpatient visit$/).waitFor();
      const bill = page.getByRole("table", { name: "The bill" });
      await bill.locator("tbody tr").first().waitFor();
      expect("the lines", await bill.locator("tbody tr").allInnerTexts(), ["Malaria rapid test\t1\tKES 300"]);
      expect("what is to pay", await bill.locator("tfoot tr").allInnerTexts(), ["To pay\tKES 300"]);
      expect("bills read", billReads, [`/encounters/${visitId}/charges`]);
    });

    await step("the shift shows what should be in the drawer", async () => {
      const shift = page.getByRole("region", { name: "Your shift" });
      await shift.getByText(/^(Should be in the drawer|No shift open)$/).first().waitFor();
      // A run stopped between closing the shift and opening the next leaves none: one is opened, as at a shift's start.
      if (await shift.getByText("No shift open").count() > 0) {
        await shift.getByLabel("Cash in the drawer now, in shillings").fill("2000");
        await shift.getByRole("button", { name: "Open my shift" }).click();
      }
      await shift.getByText("Should be in the drawer").waitFor();
      await shift.getByText(/^KES [\d,]+$/).first().waitFor();
    });

    await step("part paid in cash through a lost answer is billed and recorded once, under one key, and its receipt opens", async () => {
      await page.getByRole("button", { name: "Cash", exact: true }).click();
      const amount = page.getByLabel("Amount, in shillings");
      expect("the amount, at first what is due", await amount.inputValue(), "300");
      await amount.fill("100");
      const keys: Record<string, string[]> = { bill: [], pay: [] };
      let answerLost = false;
      // A refused payment fails the step at once, with its status, instead of waiting for the lost answer.
      let refused: (status: number) => void = () => {};
      const refusal = new Promise<never>((_, reject) => {
        refused = status => reject(new Error(`the payment, before its answer is lost: expected it recorded, got HTTP ${status}`));
      });
      refusal.catch(() => {});
      const billOrPay = (url: URL) => url.pathname === `/encounters/${visitId}/bill-now` || url.pathname === "/payments";
      await page.route(billOrPay, async (route) => {
        const pay = new URL(route.request().url()).pathname === "/payments";
        keys[pay ? "pay" : "bill"].push(route.request().headers()["idempotency-key"] ?? "");
        if (!pay || answerLost)
          return route.continue();
        answerLost = true;
        // Billed and paid, but the answer never reaches the page. A refusal goes through to the page.
        const answered = await route.fetch();
        if (!answered.ok()) {
          refused(answered.status());
          return route.fulfill({ response: answered });
        }
        paid = true;
        await route.abort("connectionreset");
      });
      // The receipt's tab opens at the press, and closes when no answer comes.
      const [lost] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Record KES 100 in cash and print the receipt" }).click()]);
      await Promise.race([alert(page, "No answer: the connection dropped").waitFor(), refusal]);
      if (!lost.isClosed())
        await lost.waitForEvent("close");
      expect("the amount, held as sent", [await amount.inputValue(), await amount.isDisabled()], ["100", true]);
      const [receipt, replayed] = await Promise.all([
        context.waitForEvent("page"),
        page.waitForResponse(response => new URL(response.url()).pathname === "/payments" && response.request().method() === "POST"),
        page.getByRole("button", { name: "Try again: record the payment" }).click(),
      ]);
      expect("the payment's answer, replayed", replayed.headers()["idempotent-replayed"], "true");
      await page.unroute(billOrPay);
      const [first] = keys.bill;
      expect("one key for the action, sent twice for each request", [keys.bill.length, keys.pay.length, keys.bill[1] === first, keys.pay[1] === keys.pay[0], first.endsWith(".bill"), keys.pay[0] === `${first.slice(0, -".bill".length)}.pay`], [2, 2, true, true, true, true]);
      await page.getByRole("status").filter({ hasText: /^KES 100 paid\. Receipt RCT-/ }).waitFor();
      await page.getByText("KES 200 is still to pay on this visit.").waitFor();
      await receipt.waitForURL(/^blob:/);
      await receipt.close();
      expect("the row on Money due", await row.getByText(/^KES /).innerText(), "KES 200");
    });

    await step("a waiver is asked for on the bill, with the reason, and until approved the amount is still due; what was typed for the payment and the waiver is kept between them", async () => {
      // Typed for the payment, then the waiver asked for first.
      await page.getByLabel("Amount, in shillings").fill("150");
      await page.getByRole("button", { name: "Ask for a waiver" }).click();
      const bill = page.getByRole("button", { name: /^INV-\S+, KES 200 owed$/ });
      await bill.click();
      const amount = page.getByLabel("Amount to waive, in shillings");
      expect("the amount, at first all the bill owes", await amount.inputValue(), "200");
      await amount.fill("50");
      await page.getByLabel("Why").fill("Flows: the in-charge said so");
      // Back to the payment and here again: what was typed for the waiver is still there.
      await page.getByRole("button", { name: "Back to taking payment" }).click();
      await page.getByRole("button", { name: "Ask for a waiver" }).click();
      expect("the waiver, as typed before going back", [await bill.getAttribute("aria-pressed"), await amount.inputValue(), await page.getByLabel("Why").inputValue()], ["true", "50", "Flows: the in-charge said so"]);
      const [asked] = await Promise.all([
        page.waitForResponse(response => /\/invoices\/[\w-]+\/adjustments$/.test(new URL(response.url()).pathname) && response.request().method() === "POST"),
        page.getByRole("button", { name: "Ask for a waiver of KES 50" }).click(),
      ]);
      waiverId = (await asked.json() as { id: string }).id;
      await page.getByRole("status").filter({ hasText: /^Waiver of KES 50 asked for, on INV-/ }).waitFor();
      // The bill says the waiver waits for the in-charge, so nobody asks for it again.
      await page.getByText(/^A waiver of KES 50 on INV-\S+, asked for at \d\d:\d\d, waits for the in-charge\.$/).waitFor();
      expect("what the API says is due, the waiver not approved yet", (await dueOnVisit())?.dueCents, 20_000);
      await page.getByRole("button", { name: "Back to taking payment" }).click();
      expect("the payment's amount, as typed before the waiver", await page.getByLabel("Amount, in shillings").inputValue(), "150");
    });

    await step("what the patient owes on bills out opens at the cashier for them, credit on the account goes on the bill, and the rest by bank transfer settles it", async () => {
      // Paid before, naming only the patient: credit on their account.
      const credited = await context.request.post(`${API_URL}/payments`, { headers: { "x-facility-id": facilityId, "origin": APP_URL }, data: { patientId, method: "bank", reference: `FT FLOWS ${RUN} CREDIT`, amountCents: 10_000 } });
      expect("paying in credit", credited.status(), 201);
      paid = true;
      await page.goto(`${APP_URL}/cashier?patient=${patientId}`);
      await heading(page).filter({ hasText: name }).waitFor();
      const bill = page.getByRole("button", { name: /^INV-.*KES 200 still owed, of KES 300/ });
      expect("the oldest bill owing, chosen", await bill.getAttribute("aria-pressed"), "true");
      const credit = page.getByRole("region", { name: "Credit on the account" });
      await credit.getByText(/^KES 100, paid \d\d:\d\d$/).waitFor();
      await credit.getByRole("button", { name: /^Use the credit on INV-/ }).click();
      await page.getByRole("status").filter({ hasText: /^KES 100 of the credit went on INV-/ }).waitFor();
      await page.getByRole("button", { name: /^INV-.*KES 100 still owed, of KES 300/ }).waitFor();
      await page.getByRole("button", { name: "Card or bank" }).click();
      await page.getByRole("button", { name: "Bank transfer" }).click();
      await page.getByLabel("The transfer's reference").fill(`FT FLOWS ${RUN}`);
      expect("the amount, what the bill owes", await page.getByLabel("Amount, in shillings").inputValue(), "100");
      const [receipt] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Record KES 100 by bank transfer and print the receipt" }).click()]);
      await page.getByRole("status").filter({ hasText: /^Paid in full\. Receipt RCT-/ }).waitFor();
      await page.getByText("Nothing more is owed on this bill.").waitFor();
      await receipt.waitForURL(/^blob:/);
      await receipt.close();
      await row.waitFor({ state: "detached" });
      expect("the visit, on the API's list of money due", await dueOnVisit(), undefined);
    });

    await step("closing the shift with the drawer counted says it is right, and a new shift opens with its float", async () => {
      const shift = page.getByRole("region", { name: "Your shift" });
      const expected = (await shift.getByText("Should be in the drawer").locator("xpath=following-sibling::dd").innerText()).replace(/^KES /, "");
      await shift.getByRole("button", { name: "Close my shift and count the drawer" }).click();
      await shift.getByLabel("Cash counted in the drawer, in shillings").fill(expected);
      await shift.getByRole("button", { name: "Close my shift", exact: true }).click();
      await shift.getByRole("status").filter({ hasText: "Your shift is closed" }).filter({ hasText: "The drawer is right." }).waitFor();
      await shift.getByLabel("Cash in the drawer now, in shillings").fill("2,000");
      await shift.getByRole("button", { name: "Open my shift" }).click();
      await shift.getByText(/^\d\d:\d\d, float KES 2,000$/).waitFor();
      expect("the closed shift's message, once the next is open", await shift.getByText("Your shift is closed").count(), 0);
    });

    await step("the waiver is withdrawn, and the visit cancelled, or settled once paid into, so no list keeps a made-up patient", async () => {
      const asCashier = { "x-facility-id": facilityId, "origin": APP_URL };
      if (waiverId) {
        const withdrawn = await context.request.post(`${API_URL}/adjustments/${waiverId}/withdraw`, { headers: asCashier });
        expect("withdrawing the waiver", withdrawn.status(), 200);
      }
      // A paid visit keeps its payments, which only finance reverses: what a failed run left owing is paid off instead.
      if (visitId && paid) {
        const owing = await dueOnVisit();
        if (owing) {
          const settled = await context.request.post(`${API_URL}/payments`, { headers: asCashier, data: { patientId, method: "bank", reference: `FT FLOWS ${RUN} CLEAN`, amountCents: owing.dueCents, encounterId: visitId } });
          expect(`settling the ${owing.dueCents / 100} shillings a failed run left owing on visit ${visitId}`, settled.status(), 201);
        }
        return;
      }
      if (!visitId)
        return;
      for (const item of testItems) {
        const cancelled = await clerk.post(`${API_URL}/order-items/${item}/cancel`, { headers: asClerk, data: { reason: "Entered by pnpm flows" } });
        expect("cancelling the test", cancelled.status(), 200);
      }
      const cancelled = await clerk.post(`${API_URL}/encounters/${visitId}/cancel`, { headers: asClerk, data: { reason: "Opened by pnpm flows" } });
      expect("cancelling the visit", cancelled.status(), 200);
    }, { always: true });

    await clerk.dispose();
    await context.close();
  },
};

const waiversFlow: Flow = {
  name: "waivers",
  about: "the in-charge sees the waivers the cashier asked for, approves one, which takes it off the bill, and rejects the next",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();
    // The front desk and the cashier, at other computers: a made-up patient's test is billed, and two waivers asked for on it.
    const clerk = await request.newContext();
    const cashier = await request.newContext();
    const familyName = `Flows${RUN}`;
    const name = `Imani ${familyName}`;
    let facilityId = "";
    let visitId = "";
    let patientId = "";
    let invoiceId = "";
    let cashierName = "";
    const waivers: { id: string; amountCents: number; reason: string }[] = [];
    const as = () => ({ "x-facility-id": facilityId, "origin": APP_URL });
    // What the API's list of money due says is due on the made-up visit: the list comes oldest first, 200 at a time.
    const dueOnVisit = async () => {
      for (let offset = 0; ;) {
        const answered = await cashier.get(`${API_URL}/cashier/due?offset=${offset}`, { headers: { "x-facility-id": facilityId } });
        expect("reading the list of money due", answered.status(), 200);
        const { visits } = await answered.json() as { visits: { encounterId: string; dueCents: number }[] };
        const visit = visits.find(due => due.encounterId === visitId);
        if (visit || visits.length < 200)
          return visit?.dueCents;
        offset += visits.length;
      }
    };

    await step("the front desk sends a made-up patient to the lab, and the cashier bills the test and asks for two waivers on it", async () => {
      await apiSignIn(clerk, seeded("frontdesk"), SEED_PASSWORD);
      const { facilities } = await (await clerk.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string; name: string }[] };
      facilityId = facilities.find(facility => facility.name === "Sample Hospital")?.id ?? "";
      const registered = await clerk.post(`${API_URL}/patients`, { headers: as(), data: { givenName: "Imani", familyName, sex: "female", dateOfBirth: "1988-06-02", noPhoneReason: "no_phone", noIdReason: "not_carried" } });
      expect("registering the patient", registered.status(), 201);
      patientId = (await registered.json() as { id: string }).id;
      const opened = await clerk.post(`${API_URL}/encounters`, { headers: as(), data: { patientId, kind: "opd", queueAt: null } });
      expect("opening the visit", opened.status(), 201);
      visitId = (await opened.json() as { id: string }).id;
      const { tests } = await (await clerk.get(`${API_URL}/lab-tests`, { headers: { "x-facility-id": facilityId } })).json() as { tests: { id: string; name: string }[] };
      const entered = await clerk.post(`${API_URL}/encounters/${visitId}/walk-in-orders`, { headers: as(), data: { selfRequested: true, labTestIds: [tests.find(test => test.name === "Malaria rapid test")?.id] } });
      expect("entering the test", entered.status(), 201);
      await apiSignIn(cashier, seeded("cashier"), SEED_PASSWORD);
      const billed = await cashier.post(`${API_URL}/encounters/${visitId}/bill-now`, { headers: as() });
      expect("billing the test", billed.status(), 201);
      invoiceId = (await billed.json() as { id: string }).id;
      for (const [amountCents, reason] of [[10_000, "Flows: to approve"], [5_000, "Flows: to reject"]] as const) {
        const asked = await cashier.post(`${API_URL}/invoices/${invoiceId}/adjustments`, { headers: as(), data: { kind: "waiver", amountCents, reason } });
        expect("asking for a waiver", asked.status(), 201);
        const waiver = await asked.json() as { id: string; requestedByName: string };
        waivers.push({ id: waiver.id, amountCents, reason });
        cashierName = waiver.requestedByName;
      }
    });

    await step("the in-charge lands on the waivers, named in the header, with both waiting, the longest waiting first", async () => {
      await authRoom(1);
      await signInAs(page, seeded("finance"), SEED_PASSWORD);
      await page.waitForURL("**/waivers");
      await page.locator("header").getByText("Waivers", { exact: true }).waitFor();
      const queue = page.getByRole("region", { name: /^Waiting for you/ });
      const rows = queue.getByRole("button", { name: new RegExp(`^${name}`) });
      await rows.first().waitFor();
      // Each row: who, the bill and when it was asked, and how much; the time and the bill's number as they come.
      const texts = (await rows.allInnerTexts()).map(text => text.replace(/\s+/g, " ").replace(/INV-\S+/, "INV").replace(/\d\d:\d\d/, "HH:MM"));
      expect("the patient's two waivers, the longest waiting first", texts, [`${name} INV · asked at HH:MM KES 100`, `${name} INV · asked at HH:MM KES 50`]);
    });

    await step("choosing a waiver shows who it is for, how much, on which bill, who asked and why", async () => {
      await page.getByRole("region", { name: /^Waiting for you/ }).getByRole("button", { name: new RegExp(`^${name}.*KES 100$`) }).click();
      await heading(page).filter({ hasText: name }).waitFor();
      expect("the address", new URL(page.url()).search, `?waiver=${waivers[0].id}`);
      const fact = (label: string) => page.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd").innerText();
      expect("what it shows", [await fact("To waive"), await fact("On the bill"), await fact("Asked by"), await fact("Why")].map(text => text.replace(/\d\d:\d\d/, "HH:MM").replace(/INV-\S+?,/, "INV,")), ["KES 100", "INV, a bill of KES 300", `${cashierName}, at HH:MM`, "Flows: to approve"]);
    });

    await step("approving it takes it off the bill, and it is decided today; the next waiver is offered", async () => {
      await page.getByRole("button", { name: "Approve the waiver" }).click();
      await page.getByRole("status").filter({ hasText: /^Approved: KES 100 off INV-/ }).waitFor();
      const list = page.getByRole("region", { name: /^Waiting for you/ });
      await list.getByText(/^Decided today/).waitFor();
      await list.getByRole("listitem").filter({ hasText: name }).filter({ hasText: /Approved\s*by .+, \d\d:\d\d/ }).waitFor();
      expect("what the API says is due, the waiver approved", await dueOnVisit(), 20_000);
      // Next is the waiver that has waited longest: this flow's second, unless another patient's waits from before.
      const { adjustments } = await (await context.request.get(`${API_URL}/adjustments?status=pending`, { headers: { "x-facility-id": facilityId } })).json() as { adjustments: { kind: string; requestedAt: string; patient: { name: string } | null }[] };
      const oldest = adjustments.filter(adjustment => adjustment.kind === "waiver").sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))[0];
      expect("a waiver still waiting, this flow's second at least", oldest !== undefined, true);
      await page.getByRole("button", { name: `Next: ${oldest.patient?.name ?? "A payer's bill"}` }).waitFor();
    });

    await step("the next is rejected, and the bill stays due in full", async () => {
      // This flow's second waiver, chosen from the list, whichever Next offers.
      await page.getByRole("region", { name: /^Waiting for you/ }).getByRole("button", { name: new RegExp(`^${name}.*KES 50$`) }).click();
      expect("the address", new URL(page.url()).search, `?waiver=${waivers[1].id}`);
      await page.locator("dt", { hasText: "Why" }).locator("xpath=following-sibling::dd").filter({ hasText: "Flows: to reject" }).waitFor();
      await page.getByRole("button", { name: "Reject the waiver" }).click();
      await page.getByRole("status").filter({ hasText: /^Rejected: INV-\S+ stays due in full/ }).waitFor();
      expect("what the API says is due, the waiver rejected", await dueOnVisit(), 20_000);
    });

    await step("the waivers left waiting are withdrawn, and what the visit owes is paid, so no list keeps a made-up patient", async () => {
      if (!facilityId || !visitId)
        return;
      for (const waiver of waivers) {
        const withdrawn = await cashier.post(`${API_URL}/adjustments/${waiver.id}/withdraw`, { headers: as() });
        // Decided already, by the in-charge: nothing to withdraw.
        expect("withdrawing a waiver still waiting", [200, 409].includes(withdrawn.status()), true);
      }
      const owing = await dueOnVisit();
      if (owing) {
        const settled = await cashier.post(`${API_URL}/payments`, { headers: as(), data: { patientId, method: "bank", reference: `FT FLOWS ${RUN} WAIVERS`, amountCents: owing, encounterId: visitId } });
        expect(`settling the ${owing / 100} shillings visit ${visitId} owes`, settled.status(), 201);
      }
    }, { always: true });

    await clerk.dispose();
    await cashier.dispose();
    await context.close();
  },
};

const triageFlow: Flow = {
  name: "triage",
  about: "the nurse calls in a made-up patient, is asked for what is missing, has a reading no patient could have refused at its field, and saves the triage through a lost answer, sending them to a clinic",
  async run(browser, step) {
    const { context } = await freshContext(browser);
    const page = await context.newPage();
    // The front desk, at another computer: it starts a made-up patient's visit, which joins triage.
    const clerk = await request.newContext();
    const familyName = `Flows${RUN}`;
    const name = `Jabali ${familyName}`;
    let facilityId = "";
    let visitId = "";
    const as = () => ({ "x-facility-id": facilityId, "origin": APP_URL });
    const clinic = "General OPD";
    const triagePosts: string[] = [];
    page.on("request", (sent) => {
      if (sent.method() === "POST" && /^\/queue-entries\/[\w-]+\/triage$/.test(new URL(sent.url()).pathname))
        triagePosts.push(sent.headers()["idempotency-key"] ?? "");
    });

    await step("the front desk starts a made-up patient's visit, and they join triage", async () => {
      await apiSignIn(clerk, seeded("frontdesk"), SEED_PASSWORD);
      const { facilities } = await (await clerk.get(`${API_URL}/me/facilities`)).json() as { facilities: { id: string; name: string }[] };
      facilityId = facilities.find(facility => facility.name === "Sample Hospital")?.id ?? "";
      const registered = await clerk.post(`${API_URL}/patients`, { headers: as(), data: { givenName: "Jabali", familyName, sex: "male", dateOfBirth: "1990-03-14", noPhoneReason: "no_phone", noIdReason: "not_carried" } });
      expect("registering the patient", registered.status(), 201);
      const opened = await clerk.post(`${API_URL}/encounters`, { headers: as(), data: { patientId: (await registered.json() as { id: string }).id, kind: "opd" } });
      expect("opening the visit", opened.status(), 201);
      visitId = (await opened.json() as { id: string }).id;
    });

    await step("the nurse lands on triage, named in the header, with the patient waiting, their sex, age and wait", async () => {
      await authRoom(1);
      await signInAs(page, seeded("triage"), SEED_PASSWORD);
      await page.waitForURL("**/triage");
      await page.locator("header").getByText("Triage", { exact: true }).waitFor();
      const row = page.getByRole("region", { name: "Waiting for triage" }).getByRole("listitem").filter({ hasText: name });
      await row.getByText(/^Male · \d+ years · waiting (under a minute|\d+ min)$/).waitFor();
    });

    await step("calling the patient in puts them with the nurse, with the form for their triage", async () => {
      await page.getByRole("button", { name: `Call in ${name}` }).click();
      await heading(page).filter({ hasText: name }).waitFor();
      expect("the address names the queue entry", /^\?entry=[\w-]+$/.test(new URL(page.url()).search), true);
      expect("the patient, with the nurse", await page.getByRole("button", { name: new RegExp(`^${name}`) }).getAttribute("aria-pressed"), "true");
      await page.getByRole("group", { name: /^Allergies/ }).getByText("not asked before").waitFor();
    });

    await step("saving with nothing filled in asks for the complaint, how soon and where to, each at its field, and sends nothing", async () => {
      await page.getByRole("button", { name: "Save and send", exact: true }).click();
      for (const problem of ["Say what brings the patient in, in a few words.", "Choose how soon the patient must be seen.", "Choose where the patient goes next."])
        await page.getByText(problem, { exact: true }).waitFor();
      expect("triages sent", triagePosts.length, 0);
    });

    await step("a temperature no patient could have is refused at its field, and what was typed is kept", async () => {
      await page.getByLabel(`What brings ${name} in today`).fill("Flows: fever for two days");
      await page.getByLabel("Temperature, °C").fill("384");
      await page.getByLabel("Pulse, per minute").fill("96");
      await page.getByRole("button", { name: "Urgent, next" }).click();
      await page.getByRole("button", { name: new RegExp(`^${clinic}`) }).click();
      await page.getByRole("button", { name: `Save and send to ${clinic}` }).click();
      await page.getByRole("alert").filter({ hasText: /^Not saved/ }).waitFor();
      await page.getByText("No reading could be this: check it for a typing slip.").waitFor();
      expect("what was typed, kept", [await page.getByLabel(`What brings ${name} in today`).inputValue(), await page.getByLabel("Pulse, per minute").inputValue()], ["Flows: fever for two days", "96"]);
    });

    await step("the triage saved through a lost answer is recorded once, under one key, and the patient is in the clinic's queue", async () => {
      await page.getByLabel("Temperature, °C").fill("38.4");
      await page.getByRole("button", { name: "None known" }).click();
      const sentBefore = triagePosts.length;
      let answerLost = false;
      const triageCall = (url: URL) => /^\/queue-entries\/[\w-]+\/triage$/.test(url.pathname);
      await page.route(triageCall, async (route) => {
        if (answerLost)
          return route.continue();
        answerLost = true;
        // Saved, but the answer never reaches the page.
        const answered = await route.fetch();
        if (!answered.ok())
          return route.fulfill({ response: answered });
        await route.abort("connectionreset");
      });
      await page.getByRole("button", { name: `Save and send to ${clinic}` }).click();
      await page.getByRole("alert").filter({ hasText: "No answer: the connection dropped" }).waitFor();
      expect("the form, held as sent", await page.getByLabel("Temperature, °C").isDisabled(), true);
      const [replayed] = await Promise.all([
        page.waitForResponse(response => triageCall(new URL(response.url())) && response.request().method() === "POST"),
        page.getByRole("button", { name: `Try again: save and send to ${clinic}` }).click(),
      ]);
      await page.unroute(triageCall);
      expect("the triage's answer, replayed", replayed.headers()["idempotent-replayed"], "true");
      const keys = triagePosts.slice(sentBefore);
      expect("one key, sent twice", [keys.length, keys[0] === keys[1]], [2, true]);
      await page.getByRole("status").filter({ hasText: `${name} is in the ${clinic} queue, as urgent.` }).waitFor();
      const visit = await (await clerk.get(`${API_URL}/encounters/${visitId}`, { headers: { "x-facility-id": facilityId } })).json() as { queue: { servicePointName: string; status: string } | null };
      expect("where the API says the patient waits", [visit.queue?.servicePointName, visit.queue?.status], [clinic, "waiting"]);
    });

    await step("the clinic's fee is cancelled, the patient taken out of the queue and the visit closed, so no list keeps a made-up patient", async () => {
      if (!visitId)
        return;
      // The clinic's consultation fee, charged when triage sent the patient there: cancelled by finance, who keep the charges.
      const finance = await request.newContext();
      await apiSignIn(finance, seeded("finance"), SEED_PASSWORD);
      const { charges } = await (await finance.get(`${API_URL}/encounters/${visitId}/charges`, { headers: { "x-facility-id": facilityId } })).json() as { charges: { id: string; cancelledAt: string | null }[] };
      for (const charge of charges.filter(standing => standing.cancelledAt === null)) {
        const cancelled = await finance.post(`${API_URL}/charges/${charge.id}/cancel`, { headers: as(), data: { reason: "Charged by pnpm flows" } });
        expect("cancelling the clinic's fee", cancelled.status(), 200);
      }
      await finance.dispose();
      const visit = await (await clerk.get(`${API_URL}/encounters/${visitId}`, { headers: { "x-facility-id": facilityId } })).json() as { queue: { entryId: string; servicePointName: string; status: string } | null };
      // Still with the nurse, if a step failed: triage ends with no clinic named, which joins no queue.
      if (visit.queue?.status === "serving") {
        const ended = await context.request.post(`${API_URL}/queue-entries/${visit.queue.entryId}/triage`, { headers: as(), data: { priority: "routine" } });
        expect("ending the triage", ended.status(), 200);
      }
      else if (visit.queue) {
        const removed = await clerk.post(`${API_URL}/queue-entries/${visit.queue.entryId}/remove`, { headers: as(), data: { outcome: "cancelled" } });
        expect("taking the patient out of the queue", removed.status(), 200);
      }
      const closed = await clerk.post(`${API_URL}/encounters/${visitId}/close`, { headers: as() });
      expect("closing the visit", closed.status(), 200);
    }, { always: true });

    await clerk.dispose();
    await context.close();
  },
};

const FLOWS = [signInFlow, pickerFlow, invitationFlow, twoStepFlow, resetFlow, frontDeskFlow, registerFlow, triageFlow, cashierFlow, waiversFlow];

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
  const step: Step = async (label, check, options) => {
    if (stopped && !options?.always)
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
