import { notFound } from "next/navigation";
import { RoomHarness } from "@/features/interview/e2e/room-harness";

export const dynamic = "force-dynamic";

export default function RoomHarnessPage() {
  // Test-only surface: never rendered in a production build, regardless of env.
  if (process.env.NODE_ENV === "production" || process.env.E2E_HARNESS !== "1") {
    notFound();
  }
  return <RoomHarness />;
}
