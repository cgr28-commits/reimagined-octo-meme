import type { Metadata } from "next";
import GpsTestClient from "./GpsTestClient";

export const metadata: Metadata = {
  title: "Private GPS test | My Airport Taxi NI",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function GpsTestPage() {
  return <GpsTestClient />;
}
