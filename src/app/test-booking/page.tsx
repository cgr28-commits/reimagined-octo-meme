import type { Metadata } from "next";
import { Suspense } from "react";
import TestBookingPageClient from "./TestBookingPageClient";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Test booking | ${SITE.name}`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function TestBookingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-navy px-4 pt-28 pb-16">
          <p className="text-sm text-white/70">Loading test booking…</p>
        </main>
      }
    >
      <TestBookingPageClient />
    </Suspense>
  );
}
