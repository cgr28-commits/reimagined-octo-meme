import type { Metadata } from "next";
import { SITE } from "@/lib/data";
import OwnerPriceClient from "./OwnerPriceClient";

export const metadata: Metadata = {
  title: `Send a price | ${SITE.name}`,
  description: "Owner: send a price for a website request.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/owner/price/" },
  referrer: "no-referrer",
};

export default function OwnerPricePage() {
  return (
    <main className="min-h-screen bg-navy px-4 pb-16 pt-10 text-white">
      <div className="mx-auto max-w-md">
        <OwnerPriceClient />
      </div>
    </main>
  );
}
