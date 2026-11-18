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
    forgot: "Forgot your password?",
  },
  /** A new password, typed twice: accepting an invitation, and resetting a forgotten one. */
  newPassword: {
    hint: "At least 10 characters.",
    confirm: "Type it again",
    mismatch: "The two passwords are not the same. Type the second one again.",
    rules: "Choose a password of at least 10 characters.",
  },
  passwordReset: {
    requestPageTitle: "Forgot your password",
    requestTitle: "Reset your password",
    requestIntro: "Enter the email address you sign in with. We will email you a link to choose a new password.",
    email: "Email",
    request: "Email me a link",
    requesting: "Sending…",
    sentTitle: "Check your email",
    sent: "If that address has an account, we have emailed it a link to choose a new password. The link works once, for one hour.",
    backToSignIn: "Back to sign in",
    pageTitle: "Choose a new password",
    title: "Choose a new password",
    password: "New password",
    submit: "Change my password",
    submitting: "Changing…",
    doneTitle: "Your password is changed",
    done: "Every device that was signed in has been signed out. Sign in with your new password.",
    signIn: "Sign in",
    noToken: "This link is not complete. Open it again from your email, or ask for a new one.",
    linkInvalid: "This link has expired or has been used already.",
    askAgain: "Ask for a new link",
    failed: "That did not work, on our side. Try again in a moment.",
  },
  acceptInvitation: {
    pageTitle: "Accept your invitation",
    title: "Set up your account",
    intro: "Choose a password to finish accepting your invitation. If you already have an account, leave these empty: your password stays as it is.",
    password: "Choose a password",
    submit: "Accept the invitation",
    submitting: "Accepting…",
    noToken: "This link is not complete. Open the invitation again from your email.",
    createdTitle: "Your account is ready",
    created: (facility: string) => `You can now work at ${facility}. Sign in with your email address and the password you chose.`,
    joinedTitle: "Invitation accepted",
    joined: (facility: string) => `You can now work at ${facility}. Sign in with the password you already have: anything typed here was not used.`,
    signIn: "Sign in",
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
