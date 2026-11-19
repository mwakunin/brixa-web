"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Brand } from "@/components/brand";
import { CenteredPage } from "@/components/centered-page";
import { formCard, OutcomeTitle, PendingStatus, primaryAction, Problem } from "@/components/form-card";
import { PageFailed, PageLoading } from "@/components/page-states";
import { QrCode } from "@/components/qr-code";
import { TextField } from "@/components/text-field";
import { twoFactor, useSession } from "@/lib/auth-client";
import { signInHref } from "@/lib/navigation";
import { type SignInFailure } from "@/lib/sign-in";
import { setUpFailureText, setUpKey, typedCode } from "@/lib/two-step";
import { en } from "@/strings/en";

type Stage
  = | { step: "password" }
    | { step: "scan"; totpURI: string; backupCodes: string[] }
    | { step: "codes"; backupCodes: string[] };

/**
 * Two-step sign-in, set up in three steps: the password again, to prove it is
 * the person and not someone at a computer they left; the app, by its QR code
 * or a key to type, confirmed by its first code; then the backup codes, shown
 * once.
 *
 * The secret and the backup codes live in this component's state alone, and
 * leave memory with the full page load that follows. Someone signed out is
 * sent to sign in; someone who has it set up already goes on.
 */
export function SetUpSignIn({ next }: { next: string }) {
  const { data: session, isPending, error, refetch } = useSession();
  const [stage, setStage] = useState<Stage>({ step: "password" });
  const signedOut = !isPending && !error && !session;
  // Only before starting: once it is confirmed, the backup codes are still to be shown.
  const setUpAlready = session?.user.twoFactorEnabled === true && stage.step === "password";

  useEffect(() => {
    if (signedOut)
      window.location.replace(signInHref(next));
    else if (setUpAlready)
      window.location.replace(next);
  }, [signedOut, setUpAlready, next]);

  if (error && !session)
    return <PageFailed message={en.errors.offline} onRetry={() => void refetch()} />;
  if (!session || setUpAlready)
    return <PageLoading message={en.session.checking} />;

  return (
    <CenteredPage>
      <Brand />
      {stage.step === "password" && <PasswordStep onEnabled={(totpURI, backupCodes) => setStage({ step: "scan", totpURI, backupCodes })} />}
      {stage.step === "scan" && <ScanStep totpURI={stage.totpURI} onConfirmed={() => setStage({ step: "codes", backupCodes: stage.backupCodes })} />}
      {stage.step === "codes" && <BackupCodes codes={stage.backupCodes} onDone={() => window.location.replace(next)} />}
    </CenteredPage>
  );
}

/** A Better Auth call, as the forms here need it: its data, or what to say. */
async function attempt<T>(call: () => Promise<{ data: T | null; error: SignInFailure | null }>): Promise<{ data: T } | { problem: string }> {
  let failure: SignInFailure | null;
  try {
    const { data, error } = await call();
    if (data && !error)
      return { data };
    failure = error;
  }
  catch {
    failure = null;
  }
  return { problem: setUpFailureText(failure) };
}

function PasswordStep({ onEnabled }: { onEnabled: (totpURI: string, backupCodes: string[]) => void }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setProblem(null);
    const answer = await attempt(() => twoFactor.enable({ password }));
    if ("data" in answer && answer.data.method === "totp") {
      onEnabled(answer.data.totpURI, answer.data.backupCodes);
      return;
    }
    setProblem("problem" in answer ? answer.problem : en.signIn.failed);
    setPassword("");
    setPending(false);
    input.current?.focus();
  }

  return (
    // POST, so that a press before the page has loaded its script never puts the password in a URL.
    <form method="post" onSubmit={submit} className={formCard}>
      <h1 className="text-[22px] font-semibold">{en.twoStep.setUp.title}</h1>
      <p>{en.twoStep.setUp.intro}</p>
      <TextField ref={input} label={en.twoStep.setUp.password} hint={en.twoStep.setUp.passwordHint} type="password" name="password" autoComplete="current-password" required readOnly={pending} value={password} onChange={(event) => { setPassword(event.target.value); setProblem(null); }} />
      {problem && <Problem><p>{problem}</p></Problem>}
      <PendingStatus message={pending ? en.twoStep.setUp.continuing : null} />
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.twoStep.setUp.continuing : en.twoStep.setUp.continue}
      </button>
    </form>
  );
}

function ScanStep({ totpURI, onConfirmed }: { totpURI: string; onConfirmed: () => void }) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const keyId = useId();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setProblem(null);
    const answer = await attempt(() => twoFactor.verifyTotp({ code: typedCode(code) }));
    if ("data" in answer) {
      onConfirmed();
      return;
    }
    setProblem(answer.problem);
    setCode("");
    setPending(false);
    input.current?.focus();
  }

  return (
    <form method="post" onSubmit={submit} className={formCard}>
      <OutcomeTitle>{en.twoStep.setUp.scanTitle}</OutcomeTitle>
      <ol className="flex list-decimal flex-col gap-4 pl-5">
        <li>{en.twoStep.setUp.install}</li>
        <li>
          {/* A list item laid out as flex loses its number, so the layout is inside it. */}
          <div className="flex flex-col gap-3">
            <span>{en.twoStep.setUp.scan}</span>
            <QrCode value={totpURI} label={en.twoStep.setUp.qrLabel} />
            <span id={keyId} className="text-[15px] text-slate-700">{en.twoStep.setUp.cannotScan}</span>
            <code aria-describedby={keyId} className="rounded-lg bg-slate-100 p-3 font-mono text-[15px] break-words text-slate-900 select-all">{setUpKey(totpURI)}</code>
          </div>
        </li>
        <li>{en.twoStep.setUp.enterCode}</li>
      </ol>
      <TextField ref={input} label={en.twoStep.setUp.code} name="code" inputMode="numeric" autoComplete="one-time-code" required readOnly={pending} value={code} onChange={(event) => { setCode(event.target.value); setProblem(null); }} />
      {problem && <Problem><p>{problem}</p></Problem>}
      <PendingStatus message={pending ? en.twoStep.setUp.confirming : null} />
      <button type="submit" disabled={pending} className={primaryAction}>
        {pending ? en.twoStep.setUp.confirming : en.twoStep.setUp.confirm}
      </button>
    </form>
  );
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const listId = useId();
  return (
    <div className={formCard}>
      <OutcomeTitle>{en.twoStep.setUp.codesTitle}</OutcomeTitle>
      <p>{en.twoStep.setUp.codesIntro}</p>
      <h2 id={listId} className="sr-only">{en.twoStep.setUp.codesLabel}</h2>
      <ul aria-labelledby={listId} className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-slate-100 p-4 font-mono text-[17px] text-slate-900">
        {codes.map(code => <li key={code}>{code}</li>)}
      </ul>
      <button type="button" onClick={() => window.print()} className="flex h-12 items-center justify-center rounded-lg border border-slate-500 bg-white font-semibold text-slate-900">
        {en.twoStep.setUp.print}
      </button>
      <button type="button" onClick={onDone} className={primaryAction}>{en.twoStep.setUp.done}</button>
    </div>
  );
}
