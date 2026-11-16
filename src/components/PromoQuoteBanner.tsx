"use client";

/**
 * Discreet offer beside the quote results: the customer can request their code without
 * leaving the booking (the form opens in place), then apply it at checkout.
 */
import { useEffect, useState } from "react";
import PromoSignupForm from "@/components/PromoSignupForm";
import { PROMO_SIGNED_UP_EVENT, promoAlreadySignedUp, type PublicPromoConfig } from "@/lib/promo-api";

export default function PromoQuoteBanner({ config, className = "" }: { config: PublicPromoConfig; className?: string }) {
  const [open, setOpen] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  useEffect(() => {
    setSignedUp(promoAlreadySignedUp(config.campaign?.id));
    const onSigned = () => setSignedUp(true);
    window.addEventListener(PROMO_SIGNED_UP_EVENT, onSigned);
    return () => window.removeEventListener(PROMO_SIGNED_UP_EVENT, onSigned);
  }, [config.campaign?.id]);

  if (!config.enabled) return null;
  const pct = config.discountPercentLabel || "10%";
  const minimum = `£${Math.round(config.minimumVehicleFareGbp)}`;
  const offer = config.campaign?.name;

  return (
    <aside
      data-promo-quote-banner
      aria-label={`${pct} discount code`}
      className={`rounded-2xl border-2 border-emerald bg-[#effaf1] px-4 py-3.5 text-[#071c38] shadow-[0_6px_20px_rgba(47,191,74,0.18)] ${className}`}
    >
      {signedUp && !open ? (
        <p className="text-sm leading-snug">
          <span className="font-bold">Your {pct} code is on its way.</span> Enter it under “Have a promo code?” at the
          next step, using the same email address.
        </p>
      ) : !open ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 text-sm leading-snug">
            <span className="mr-1.5 inline-block rounded-md bg-emerald px-1.5 py-0.5 text-xs font-extrabold text-[#071c38]">
              {offer ? `${offer.toUpperCase()} ${pct} OFF` : `${pct} OFF`}
            </span>
            <span className="text-base font-extrabold">{offer ? `${offer}: ` : ""}Get {pct} off your vehicle fare</span>
            <span className="text-[#071c38]/70"> with an email code (fares of {minimum}+).</span>
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded="false"
            className="min-h-11 shrink-0 rounded-xl bg-emerald px-4 text-sm font-extrabold text-[#071c38] shadow-sm hover:brightness-105"
          >
            Email me my code
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-sm font-bold">Get your {offer ? `${offer} ` : ""}{pct} discount code</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-[#071c38]/60 hover:text-[#071c38]"
            >
              ×
            </button>
          </div>
          <PromoSignupForm
            source="quote-banner"
            tone="light"
            validityDays={config.validityDays}
            percentLabel={pct}
            offerId={config.campaign?.id}
            autoFocus
            onDone={() => setSignedUp(true)}
          />
        </div>
      )}
    </aside>
  );
}
