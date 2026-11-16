import { en } from "@/strings/en";

/** A placeholder until the sign-in screen is built (ROADMAP §1, step F3). */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{en.app.name}</h1>
      <p className="max-w-md text-muted-foreground">{en.home.notBuiltYet}</p>
    </main>
  );
}
