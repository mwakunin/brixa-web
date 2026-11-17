/** A page with one thing in the middle: signing in, choosing a facility, accepting an invitation. */
export function CenteredPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-slate-100 px-4 py-8 text-slate-900">
      {children}
    </main>
  );
}
