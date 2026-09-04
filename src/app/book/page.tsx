import type { Metadata } from "next";
import ReturnOfferBookClient from "./ReturnOfferBookClient";

export const metadata: Metadata = {
  title: "Book your return | My Airport Taxi NI",
  description: "Book your return airport transfer with a 5% return journey saving.",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly: the secure token is read from ?returnOffer= in the client.
 * Fare is never taken from the URL — the Worker validates the token and requotes.
 */
export default function BookReturnOfferPage() {
  return (
    <main className="min-h-screen min-w-0 max-w-[100%] overflow-x-clip bg-navy px-3 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto mb-6 w-full min-w-0 max-w-lg px-0 text-center sm:mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
        <h1 className="mt-2 break-words font-display text-3xl text-white">
          Book your return
        </h1>
      </div>
      <div className="mx-auto w-full min-w-0 max-w-lg">
        <ReturnOfferBookClient />
      </div>
    </main>
  );
}
