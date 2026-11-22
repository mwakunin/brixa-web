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

type Step = (label: string, check: () => Promise<void>) => Promise<void>;

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
  about: "the clerk finds a patient, starts their visit through a dropped answer, sends them on as an emergency, and is refused a second",
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

    const visitsOf = async (id: string) => (await (await context.request.get(`${API_URL}/encounters?patientId=${id}`, { headers: { "x-facility-id": facilityId } })).json() as { encounters: { id: string; kind: string; status: string }[] }).encounters;
    // Opening a record, or the list of a patient's visits, is an audited read: the page makes none until asked.
    const recordReads: string[] = [];
    page.on("request", (sent) => {
      const url = new URL(sent.url());
      if (sent.method() === "GET" && url.origin === new URL(API_URL).origin && (/^\/patients\/[\w-]+$/.test(url.pathname) || url.pathname === "/encounters"))
        recordReads.push(url.pathname + url.search);
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
      expect("the Emergency button, while an answer is awaited", await page.getByRole("button", { name: "Emergency" }).count(), 0);
      const second = page.waitForResponse(response => response.url() === `${API_URL}/encounters` && response.request().method() === "POST");
      await page.getByRole("button", { name: "Try again: start today's visit" }).click();
      expect("the answer, replayed", (await second).headers()["idempotent-replayed"], "true");
      expect("one key, sent twice", keys.length === 2 && keys[0] === keys[1] && keys[0].length >= 8, true);
      await page.getByRole("status").filter({ hasText: `${name} is in the Triage queue.` }).waitFor();
      await page.unroute(`${API_URL}/encounters`);
    });

    await step("the visit was opened once; the record says where the patient waits, without reading it again", async () => {
      const reads = recordReads.length;
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

    await step("the visits opened are cancelled, so no queue keeps a made-up patient", async () => {
      for (const visit of (await visitsOf(patientId)).filter(visit => visit.status === "open")) {
        const cancelled = await context.request.post(`${API_URL}/encounters/${visit.id}/cancel`, { headers: { "x-facility-id": facilityId, "origin": APP_URL }, data: { reason: "Opened by pnpm flows" } });
        expect(`cancelling the ${visit.kind} visit`, cancelled.status(), 200);
      }
    });

    await context.close();
  },
};

const FLOWS = [signInFlow, pickerFlow, invitationFlow, twoStepFlow, resetFlow, frontDeskFlow];

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
