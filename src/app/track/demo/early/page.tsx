import type { Metadata } from "next";
import TrackPageClient from "../../TrackPageClient";

export const metadata: Metadata = {
  alternates: {
    canonical: "/track/demo/early/",
  },
};

export default function DemoEarlyPage() {
  return <TrackPageClient token="demo-early" />;
}
