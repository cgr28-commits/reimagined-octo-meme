import type { Metadata } from "next";
import TrackPageShell from "./page";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Live driver tracking | ${SITE.name}`,
  description: "Follow your driver's live location on the day of your airport transfer.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/track/",
  },
};

export default function TrackPage() {
  return <TrackPageShell />;
}
