import type { Metadata } from "next";
import { SITE } from "@/lib/data";
import DriverContactClient from "./DriverContactClient";

export const metadata: Metadata = {
  title: `Driver contact | ${SITE.name}`,
  description: "Secure driver contact for your My Airport Taxi NI booking.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DriverContactPage() {
  return <DriverContactClient />;
}
