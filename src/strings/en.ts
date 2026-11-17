import type { MembershipRole } from "@/lib/facility";

/**
 * Every word a member of staff reads, in one place.
 *
 * Screens import from here and never write text inline, so a Swahili file can
 * sit beside this one later with the same shape. Plain language: what a person
 * at a service point would say, never a code or a table name.
 */
export const en = {
  app: {
    name: "Brixa HMIS",
    description: "The hospital's daily work, one screen per job.",
  },
  home: {
    yourRoles: (roles: string) => `Your roles here: ${roles}.`,
    notBuiltYet: "The screens for this work are being designed with the hospital's staff. Nothing to use here yet.",
  },
  facilities: {
    pageTitle: "Where are you working",
    title: "Where are you working today?",
    loading: "Finding where you work…",
    closed: "Closed to staff for now. Ask your administrator.",
    switchLater: "You can switch at any time from the top of the screen, without signing in again.",
    noneTitle: "You have not been added to a facility yet",
    noneHelp: "Ask your hospital's administrator to add you, then sign in again.",
  },
  header: {
    switchFacility: "Switch facility",
  },
  /** Each role by the job it names, as staff say it. */
  roles: {
    facility_admin: "Administrator",
    auditor: "Auditor",
    records_clerk: "Records clerk",
    doctor: "Doctor",
    clinical_officer: "Clinical officer",
    nurse: "Nurse",
    ward_nurse: "Ward nurse",
    lab_tech: "Lab technician",
    lab_supervisor: "Lab supervisor",
    pharmacist: "Pharmacist",
    pharm_tech: "Pharmacy technician",
    storekeeper: "Storekeeper",
    cashier: "Cashier",
    billing_clerk: "Billing clerk",
    claims_officer: "Claims officer",
    finance_manager: "Finance manager",
  } satisfies Record<MembershipRole, string>,
  signIn: {
    title: "Sign in",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    byInvitation: "Accounts are by invitation. If you have none, ask your hospital's administrator to invite you.",
    wrongPassword: "That email and password do not match an account. Check both and try again.",
    notVerified: "Confirm your email address first, with the link we emailed you. Then sign in.",
    tooMany: "Too many attempts. Wait a minute, then try again.",
    failed: "Signing in did not work, on our side. Try again in a moment.",
  },
  session: {
    checking: "Checking that you are signed in…",
    signedInAs: (name: string) => `Signed in as ${name}`,
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutFailed: "You are still signed in: signing out did not reach the server. Check the connection and try again.",
  },
  errors: {
    notFound: "That is not here, or it is not yours to open.",
    signedOut: "You have been signed out. Sign in again to carry on.",
    notAllowed: "Your role does not allow that.",
    invalid: "Some of what was entered is not valid.",
    failed: "Something went wrong on our side. Try again; if it keeps happening, give this reference to support:",
    failedNoReference: "Something went wrong on our side. Try again; if it keeps happening, tell support.",
    offline: "No connection. Check the network and try again.",
    tryAgain: "Try again",
  },
} as const;

export type Strings = typeof en;
