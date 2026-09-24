"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import QuoteResultShowcase from "@/components/QuoteResultShowcase";
import { ESTATE_VEHICLE, MINIBUS_VEHICLE, SALOON_VEHICLE } from "@/lib/vehicle-selection";
import { MINIBUS_CUSTOMER_DESCRIPTION, MINIBUS_CUSTOMER_NAME } from "../../shared/vehicle-display";
import { PREVIEW_PRICING_BANNER } from "../../shared/pricing-preview-isolation";

const SALOON_IMAGE = withBasePath("/images/vehicles/quote-saloon.webp");
const ESTATE_IMAGE = withBasePath("/images/vehicles/quote-estate.webp");
const MINIBUS_IMAGE = withBasePath("/images/vehicles/quote-minibus.svg");

export default function PreviewVehicleCardsClient() {
  const [selected, setSelected] = useState<"saloon" | "estate" | "minibus">("minibus");

  return (
    <main className="min-h-screen bg-[#071c38] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-xl space-y-5">
        <p className="rounded-xl border border-sky-300/40 bg-sky-400/10 px-3 py-3 text-sm font-semibold text-sky-100">
          {PREVIEW_PRICING_BANNER}
        </p>
        <h1 className="text-2xl font-bold">Public vehicle cards</h1>
        <p className="text-sm text-white/70">
          Preview only. 7 Seater Minibus is not turned on for live customers.
        </p>
        <Link className="inline-block text-sm font-semibold text-emerald underline-offset-2 hover:underline" href="/owner/pricing-preview/">
          Back to Pricing tab
        </Link>

        <section className="space-y-2" aria-label="Vehicle category">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Quote selector</p>
          {(
            [
              { id: "saloon" as const, title: "Saloon", detail: "Selected from passengers and luggage", image: SALOON_IMAGE },
              { id: "estate" as const, title: "Estate", detail: "Selected from passengers and luggage", image: ESTATE_IMAGE },
              { id: "minibus" as const, title: MINIBUS_CUSTOMER_NAME, detail: MINIBUS_CUSTOMER_DESCRIPTION, image: MINIBUS_IMAGE },
            ] as const
          ).map((option) => {
            const isSelected = selected === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelected(option.id)}
                className={`flex min-h-16 w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                  isSelected ? "border-emerald bg-emerald/10 text-white" : "border-white/15 text-white/80"
                }`}
              >
                <Image
                  src={option.image}
                  alt=""
                  width={96}
                  height={48}
                  className="h-12 w-20 shrink-0 object-contain"
                />
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug">{option.title}</span>
                  <span className="block text-xs text-white/60">{option.detail}</span>
                </span>
              </button>
            );
          })}
        </section>

        <section className="rounded-2xl bg-white p-1">
          <QuoteResultShowcase
            vehicleType={
              selected === "minibus" ? MINIBUS_VEHICLE : selected === "estate" ? ESTATE_VEHICLE : SALOON_VEHICLE
            }
            passengers={selected === "minibus" ? 6 : 2}
            suitcases={selected === "estate" ? 4 : 1}
            priceLabel="Fixed price"
            formattedPrice={selected === "minibus" ? "£86.80" : selected === "estate" ? "£56.00" : "£50.00"}
            bookButton={
              <button type="button" className="min-h-12 w-full rounded-xl bg-emerald font-semibold text-navy">
                Preview only
              </button>
            }
          />
        </section>
      </div>
    </main>
  );
}
