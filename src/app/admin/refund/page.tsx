import type { Metadata } from "next";
import RefundPageClient from "./RefundPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Issue refund | ${SITE.name}`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function RefundPage() {
  return <RefundPageClient />;
}
