import type { Metadata } from "next";
import ShortNoticePayClient from "./ShortNoticePayClient";

export const metadata: Metadata = {
  title: "Pay for approved booking | My Airport Taxi NI",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly (GitHub Pages): do not await searchParams on the server.
 * Token is read from the URL in the client component.
 */
export default function ShortNoticePayPage() {
  return (
    <main className="min-h-screen bg-navy px-4 py-10 sm:px-6">
      <div className="mx-auto mb-8 max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald">
          My Airport Taxi NI
        </p>
      </div>
      <ShortNoticePayClient />
    </main>
  );
}
