import type { Metadata } from "next";
import AcceptAlternativeTimeClient from "./AcceptAlternativeTimeClient";

export const metadata: Metadata = {
  title: "Accept alternative pickup time | My Airport Taxi NI",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly: token is read from the URL in the client component.
 */
export default function AcceptAlternativeTimePage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-10 sm:px-6">
      <div className="mx-auto mb-8 max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
      </div>
      <AcceptAlternativeTimeClient />
    </main>
  );
}
