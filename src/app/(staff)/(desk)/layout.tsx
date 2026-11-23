import { AppHeader } from "@/components/app-header";
import { FacilityGate } from "@/components/facility-gate";

/**
 * Every desk: a facility to work in, and the bar across the top. A desk is
 * the height of the window, so its columns scroll on their own and its main
 * button stays on screen.
 */
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <FacilityGate>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <AppHeader />
        {children}
      </div>
    </FacilityGate>
  );
}
