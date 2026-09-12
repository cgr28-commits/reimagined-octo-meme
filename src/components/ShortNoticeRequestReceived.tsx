"use client";

import {
  minimumNoticeRequestBody,
  minimumNoticeRequestHeading,
} from "../../shared/booking-notice";

type ShortNoticeRequestReceivedProps = {
  reference: string;
  amountLabel?: string;
  whatsappUrl: string;
  /** When false, keep period-only availability wording (pickup may still be 12+ hours away). */
  underMinimumNotice?: boolean;
};

export default function ShortNoticeRequestReceived({
  reference,
  amountLabel,
  whatsappUrl,
  underMinimumNotice = true,
}: ShortNoticeRequestReceivedProps) {
  return (
    <div className="rounded-xl border border-amber-400/30 bg-navy-dark/50 px-5 py-8 text-center sm:px-8 sm:py-10">
      <p
        data-booking-nav-heading
        tabIndex={-1}
        className="text-xs font-medium uppercase tracking-wider text-amber-200 outline-none"
      >
        {underMinimumNotice
          ? minimumNoticeRequestHeading()
          : "Booking request received"}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        Thanks — we&apos;ve received your booking request.
      </h2>
      {amountLabel ? <p className="quote-price-figure mt-4">{amountLabel}</p> : null}
      <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-sm leading-relaxed text-white/80 sm:text-base">
        {underMinimumNotice
          ? minimumNoticeRequestBody()
          : "We just need to confirm availability for your requested pickup time before taking payment. We’ll email you once your request has been reviewed. No payment has been taken."}
      </p>
      <p className="mt-5 text-sm quote-secondary">
        Request reference: <span className="font-semibold text-white">{reference}</span>
      </p>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex min-h-11 w-full max-w-sm items-center justify-center rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:border-white/40 sm:w-auto sm:px-8"
      >
        Need a quick answer? WhatsApp us
      </a>
    </div>
  );
}
