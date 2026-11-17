import { AppHeader } from "@/components/app-header";
import { FacilityGate } from "@/components/facility-gate";

/** Every desk: a facility to work in, and the bar across the top. */
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <FacilityGate>
      <div className="flex flex-1 flex-col bg-slate-100 text-slate-900">
        <AppHeader />
        {children}
      </div>
    </FacilityGate>
  );
}
