import type { Metadata } from "next";
import PreviewVehicleCardsClient from "@/components/PreviewVehicleCardsClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `7 Seater vehicle preview | ${SITE.name}`,
  description: "Preview-only 7 Seater Minibus vehicle cards. Not live booking availability.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PreviewVehicleCardsPage() {
  return <PreviewVehicleCardsClient />;
}
