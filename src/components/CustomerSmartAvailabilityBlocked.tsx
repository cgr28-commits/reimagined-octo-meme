"use client";

import { BookingErrorWhatsAppHelp } from "@/components/QuoteBookingHelpControls";
import { CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE } from "@/lib/customer-smart-availability-client";

export function CustomerSmartAvailabilityBlocked({
  message = CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
}: {
  message?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        {message}
      </p>
      <BookingErrorWhatsAppHelp />
      <p className="text-xs leading-relaxed text-white/55">
        You can still message us on WhatsApp or send an enquiry. Online payment is paused for this
        pickup time only.
      </p>
    </div>
  );
}
