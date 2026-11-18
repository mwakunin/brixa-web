/**
 * The pieces every page outside the desks is made of: signing in, accepting
 * an invitation, resetting a password. One card, one dark button, one way of
 * saying what went wrong, so the four pages read as one set.
 */

/** The white card a form sits in, or the outcome that replaces it. */
export const formCard = "flex w-full max-w-[420px] flex-col gap-5 rounded-xl border border-slate-300 bg-white p-8";

/** The one dark button on the card, as a `<button>` or a `<Link>`. */
export const primaryAction = "flex h-12 items-center justify-center rounded-lg bg-slate-900 font-semibold text-white disabled:bg-slate-700";

/** What went wrong, announced as it appears. */
export function Problem({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="flex flex-col gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{children}</div>;
}

/** The heading of an outcome, focused when it appears so a screen reader reads it rather than nothing. */
export function OutcomeTitle({ children }: { children: React.ReactNode }) {
  return <h1 ref={heading => heading?.focus()} tabIndex={-1} className="text-[22px] font-semibold">{children}</h1>;
}
