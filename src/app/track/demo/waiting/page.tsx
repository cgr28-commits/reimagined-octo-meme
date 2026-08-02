import type { Metadata } from "next";
import TrackPageClient from "../../TrackPageClient";

export const metadata: Metadata = {
  alternates: {
    canonical: "/track/demo/waiting/",
  },
};

export default function DemoWaitingPage() {
  return <TrackPageClient token="demo-waiting" />;
}
