import type { Metadata } from "next";
import QuickQuoteOwnerClient from "./QuickQuoteOwnerClient";

export const metadata: Metadata = {
  title: "Quick Quote | My Airport Taxi NI",
  description: "Paste a WhatsApp enquiry, calculate the website fare, and copy a booking link.",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Quick Quote",
    statusBarStyle: "black-translucent",
  },
};

/** Mobile-first owner tool — add to iPhone Home Screen. Auth via OWNER_ACCESS_KEY. */
export default function QuickQuotePage() {
  return (
    <main className="min-h-screen bg-navy px-3 py-4 text-white sm:px-5 sm:py-6">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald">
            My Airport Taxi NI
          </p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-white">Quick Quote</h1>
          <p className="mt-2 text-sm text-white/65">
            Paste a WhatsApp message → check details → fixed website fare → copy booking reply.
          </p>
        </header>
        <QuickQuoteOwnerClient />
      </div>
    </main>
  );
}
