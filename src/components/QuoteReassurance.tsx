import { COMPACT_CANCELLATION_REASSURANCE } from "../../shared/cancellation-policy";

export default function QuoteReassurance({ depositAvailable = false }: { depositAvailable?: boolean }) {
  return (
    <div className="mb-1.5 space-y-1 text-left text-[13px] font-semibold leading-snug text-navy" data-quote-reassurance>
      <p className="flex items-start gap-1.5">
        <span className="shrink-0 text-emerald" aria-hidden>✓</span>
        <span>{COMPACT_CANCELLATION_REASSURANCE}</span>
      </p>
      {depositAvailable ? (
        <p className="flex items-start gap-1.5">
          <span className="shrink-0 text-emerald" aria-hidden>✓</span>
          <span>Secure Your Booking with a Small Deposit</span>
        </p>
      ) : null}
    </div>
  );
}
