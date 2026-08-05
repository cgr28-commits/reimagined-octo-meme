import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SERVICE_FLAGS } from "@/lib/data";
import TrackPageClient from "../../TrackPageClient";

export const metadata: Metadata = {
  alternates: {
    canonical: "/track/demo/waiting/",
  },
};

export default function DemoWaitingPage() {
  // Soft-hidden via SERVICE_FLAGS.trackingDemo — set true in data.ts to restore
  if (!SERVICE_FLAGS.trackingDemo) {
    notFound();
  }

  return <TrackPageClient token="demo-waiting" />;
}
