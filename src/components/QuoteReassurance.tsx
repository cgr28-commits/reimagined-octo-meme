export default function QuoteReassurance({ hasAirportCollection = false }: { hasAirportCollection?: boolean }) {
  return (
    <div className="mb-1.5 space-y-0.5 sm:space-y-1 text-left text-[13px] font-semibold leading-snug text-navy" data-quote-reassurance>
      <p className="font-bold"><span aria-hidden>🛡️</span> Book with Confidence</p>
      <p className="font-normal">Cancel 24+ hours before pickup for a 100% refund.</p>
      <p className="flex items-start gap-1.5">
        <span className="shrink-0 text-emerald" aria-hidden>✓</span>
        <span>Fixed Fares · Secure Booking</span>
      </p>
      {hasAirportCollection ? (
        <p className="flex items-start gap-1.5">
          <span className="shrink-0 text-emerald" aria-hidden>✓</span>
          <span>60 Minutes Complimentary Waiting Time</span>
        </p>
      ) : null}
      <p className="flex items-start gap-1.5">
        <span className="shrink-0 text-emerald" aria-hidden>✓</span>
        <span>Free Cancellation — 24+ Hours Notice</span>
      </p>
      <p className="text-[11px] font-normal">Terms and conditions apply.</p>
    </div>
  );
}
