"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formCard, PendingStatus, primaryAction, Problem } from "@/components/form-card";
import { TextField } from "@/components/text-field";
import { twoFactor } from "@/lib/auth-client";
import { type SignInFailure } from "@/lib/sign-in";
import { codeFailure, typedBackupCode, typedCode } from "@/lib/two-step";
import { en } from "@/strings/en";

/** A quiet way off the card: switching to a backup code, or back to the password. */
const sideAction = "self-start py-3 text-link underline underline-offset-2";

/**
 * The second step of signing in: the code from the person's authenticator
 * app, or one of their backup codes. A wrong code clears the field and says
 * so; a sign-in that has run out, or an account locked by wrong codes, goes
 * back to the password with the reason (`onStartAgain`). Nothing is
 * remembered for next time: the computers at a desk are shared.
 */
export function CodeForm({ next, onStartAgain }: { next: string; onStartAgain: (problem: string | null) => void }) {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Whether this form is still on screen, as on the password step.
  const here = useRef(true);

  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

  // The cursor goes to the code as the step appears, and again when switching between app and backup codes.
  useEffect(() => {
    input.current?.focus();
  }, [backup]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setProblem(null);
    let failure: SignInFailure | null;
    try {
      const { error } = backup
        ? await twoFactor.verifyBackupCode({ code: typedBackupCode(code) })
        : await twoFactor.verifyTotp({ code: typedCode(code) });
      if (!here.current)
        return;
      if (!error) {
        router.replace(next);
        return;
      }
      failure = error;
    }
    catch {
      failure = null;
    }
    const { text, startAgain } = codeFailure(failure);
    if (startAgain) {
      onStartAgain(text);
      return;
    }
    setProblem(text);
    setCode("");
    setPending(false);
    input.current?.focus();
  }

  function switchKind() {
    setBackup(!backup);
    setCode("");
    setProblem(null);
  }

  return (
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-title font-semibold">{en.twoStep.title}</h1>
      <p>{backup ? en.twoStep.backupIntro : en.twoStep.intro}</p>
      <TextField
        key={backup ? "backup" : "app"}
        ref={input}
        label={backup ? en.twoStep.backupCode : en.twoStep.code}
        name="code"
        inputMode="numeric"
        autoComplete={backup ? "off" : "one-time-code"}
        autoCapitalize="none"
        spellCheck={false}
        required
        readOnly={pending}
        value={code}
        onChange={(event) => { setCode(event.target.value); setProblem(null); }}
      />
      {problem && <Problem><p>{problem}</p></Problem>}
      <PendingStatus message={pending ? en.twoStep.submitting : null} />
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.twoStep.submitting : en.twoStep.submit}
      </button>
      <div className="-mt-2 flex flex-wrap justify-between gap-x-4">
        <button type="button" disabled={pending} onClick={switchKind} className={sideAction}>
          {backup ? en.twoStep.useApp : en.twoStep.useBackup}
        </button>
        <button type="button" disabled={pending} onClick={() => onStartAgain(null)} className={sideAction}>
          {en.twoStep.startAgain}
        </button>
      </div>
    </form>
  );
}
