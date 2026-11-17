import { CenteredPage } from "@/components/centered-page";
import { en } from "@/strings/en";

/** A whole page waiting on its first answer: nothing is known yet to show. */
export function PageLoading({ message }: { message: string }) {
  return (
    <CenteredPage>
      <p role="status" className="text-slate-600">{message}</p>
    </CenteredPage>
  );
}

/** A whole page whose first answer did not come: says why, and offers to ask again. */
export function PageFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <CenteredPage>
      <p role="alert" className="max-w-md text-center">{message}</p>
      <button type="button" onClick={onRetry} className="h-12 rounded-lg bg-slate-900 px-6 font-semibold text-white">
        {en.errors.tryAgain}
      </button>
    </CenteredPage>
  );
}
