"use client";

import { useEffect, useState } from "react";
import { formatCustomerPaymentDeadline, formatPaymentTimeRemaining } from "../../shared/uk-time";

/**
 * Display-only countdown. paymentExpiresAt from the server is the deadline.
 * This component never enables or blocks the pay button.
 */
export default function CustomerPaymentDeadline({
  expiresAt,
}: {
  expiresAt: string | null | undefined;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!expiresAt) return null;
  const deadline = formatCustomerPaymentDeadline(expiresAt);
  if (!deadline) return null;
  const remaining = formatPaymentTimeRemaining(expiresAt, new Date(nowMs));

  return (
    <div
      className="mt-6 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-white"
      data-customer-payment-deadline
    >
      <p className="font-semibold text-emerald">Your journey is reserved pending payment.</p>
      <p className="mt-2 text-white/85">
        Please complete payment by <span className="font-semibold text-white">{deadline.time}</span>{" "}
        on <span className="font-semibold text-white">{deadline.date}</span> to confirm your
        booking.
      </p>
      <p className="mt-2 font-semibold text-white" data-payment-time-remaining>
        Time remaining: {remaining}
      </p>
    </div>
  );
}
