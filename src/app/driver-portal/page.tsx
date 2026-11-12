import type { Metadata } from "next";
import DriverPortalClient from "./DriverPortalClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Driver portal | ${SITE.name}`,
  description: "Private portal for approved My Airport Taxi NI partner drivers.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/driver-portal/" },
};

export default function DriverPortalPage() {
  return <DriverPortalClient />;
}
