import { CenteredPage } from "@/components/centered-page";
import { en } from "@/strings/en";

/** A whole page waiting on its first answer: nothing is known yet to show. */
export function PageLoading({ message }: { message: string }) {
  return (
    <CenteredPage>
      <p role="status" className="text-muted-foreground">{message}</p>
    </CenteredPage>
  );
}

/** A whole page whose first answer did not come: says why, and offers to ask again. */
export function PageFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <CenteredPage>
      <p role="alert" className="max-w-md text-center">{message}</p>
      <button type="button" onClick={onRetry} className="h-12 rounded-lg bg-primary px-6 font-semibold text-primary-foreground">
        {en.errors.tryAgain}
      </button>
    </CenteredPage>
  );
}
