import type { Metadata } from "next";
import { SITE } from "@/lib/data";
export const metadata: Metadata = {
  title: `Track your driver | ${SITE.name}`,
  description: "Your private tracking link becomes live when your driver is on the way and starts sharing their location.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
