import { SessionGate } from "@/components/session-gate";

/** Every page behind sign-in. */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <SessionGate>{children}</SessionGate>;
}
