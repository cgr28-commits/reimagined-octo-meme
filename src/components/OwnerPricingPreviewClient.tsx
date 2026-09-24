"use client";

import Link from "next/link";
import OwnerDashboardToolSwitcher from "@/components/OwnerDashboardToolSwitcher";
import OwnerPricingPanel from "@/components/OwnerPricingPanel";
import { PREVIEW_PRICING_BANNER } from "../../shared/pricing-preview-isolation";

export default function OwnerPricingPreviewClient() {
  return (
    <main className="min-h-screen bg-navy px-4 py-6 text-white sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">Owner Dashboard</p>
        <h1 className="mt-2 text-2xl font-bold">Pricing</h1>
        <p className="mt-3 rounded-xl border border-sky-300/40 bg-sky-400/10 px-3 py-3 text-sm font-semibold text-sky-100">
          {PREVIEW_PRICING_BANNER}
        </p>
        <p className="mt-3 text-sm text-white/70">
          This page does not require the live owner key. Save stays in this preview session only.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link className="font-semibold text-emerald underline-offset-2 hover:underline" href="/owner/pricing-preview/vehicles/">
            View 7 Seater vehicle cards
          </Link>
          <Link className="font-semibold text-emerald underline-offset-2 hover:underline" href="/?previewMinibus=1">
            Public quote with 7 Seater shown
          </Link>
        </div>
        <div className="mt-6">
          <OwnerDashboardToolSwitcher value="pricing" onChange={() => undefined} />
          <OwnerPricingPanel ownerKey="preview-isolated" isolated />
        </div>
      </div>
    </main>
  );
}
