import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SERVICE_FLAGS } from "@/lib/data";
import TrackPageClient from "../../TrackPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Live map demo | ${SITE.name}`,
  alternates: {
    canonical: "/track/demo/live/",
  },
};

export default function DemoLivePage() {
  // Soft-hidden via SERVICE_FLAGS.trackingDemo — set true in data.ts to restore
  if (!SERVICE_FLAGS.trackingDemo) {
    notFound();
  }

  return <TrackPageClient token="demo-live" />;
}
