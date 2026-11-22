import { businessDate } from "@/lib/dates";
import { type FoundPatient, foundLine } from "@/lib/patients";

/** A found patient's line under their name, breaking between its parts, never inside one ("no ID"). */
export function FoundLine({ patient }: { patient: FoundPatient }) {
  return (
    <span className="text-sm text-muted-foreground">
      {foundLine(patient, businessDate()).map((part, index) => (
        <span key={part}>
          {index > 0 && " · "}
          <span className="whitespace-nowrap">{part}</span>
        </span>
      ))}
    </span>
  );
}
