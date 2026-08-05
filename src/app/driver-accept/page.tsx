import type { Metadata } from "next";
import { SITE } from "@/lib/data";
import DriverAcceptClient from "./DriverAcceptClient";

export const metadata: Metadata = {
  title: `Confirm job | ${SITE.name}`,
  description: "Driver job confirmation for My Airport Taxi NI.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DriverAcceptPage() {
  return <DriverAcceptClient />;
}
