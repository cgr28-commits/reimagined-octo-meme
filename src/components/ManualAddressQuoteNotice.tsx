import { manualAddressQuoteWhatsAppUrl } from "@/lib/booking-help-whatsapp";
import { SITE } from "@/lib/data";

type ManualAddressQuoteNoticeProps = {
  pickup: string;
  dropoff: string;
};

/**
 * Shown when a typed premises address could not be matched to a provider record.
 * No fare and no payment — the existing company WhatsApp number and business telephone.
 */
export default function ManualAddressQuoteNotice({
  pickup,
  dropoff,
}: ManualAddressQuoteNoticeProps) {
  const whatsappHref = manualAddressQuoteWhatsAppUrl(pickup, dropoff);

  return (
    <div
      className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-4 text-left"
      role="status"
      data-manual-address-quote
    >
      <p className="text-sm font-semibold text-white">
        We could not verify this address for a road route
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-white/80">
        An online fare is not available, and payment will not start from an unverified
        location. Request a manual quote and we will confirm the price.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white"
        >
          Request a quote on WhatsApp
        </a>
        <a
          href={`tel:${SITE.landline}`}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold text-white"
        >
          Call {SITE.landlineDisplay}
        </a>
      </div>
    </div>
  );
}
