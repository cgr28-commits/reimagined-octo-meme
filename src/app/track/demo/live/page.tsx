import type { Metadata } from "next";
import TrackPageClient from "../../TrackPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Live map demo | ${SITE.name}`,
  alternates: {
    canonical: "/track/demo/live/",
  },
};

export default function DemoLivePage() {
  return <TrackPageClient token="demo-live" />;
}
