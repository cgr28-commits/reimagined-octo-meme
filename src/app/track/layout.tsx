import type { Metadata } from "next";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Driver updates | ${SITE.name}`,
  description:
    "On travel day we email you when your driver is on the way. Your driver may share live location via WhatsApp when appropriate.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
