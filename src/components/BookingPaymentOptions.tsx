"use client";

import { useId } from "react";
import {
  DEPOSIT_CASH_BADGE,
  DEPOSIT_CASH_CHOOSE_HEADING,
  DEPOSIT_CASH_OPTION_LABEL,
  FULL_ONLINE_OPTION_LABEL,
  PAYMENT_METHOD_DEPOSIT_CASH,
  PAYMENT_METHOD_FULL_ONLINE,
  formatDepositCashGbp,
  todayPayLabel,
  type PaymentMethod,
  type PublicDepositCashOffer,
} from "../../shared/deposit-cash";

type Props = {
  offer: PublicDepositCashOffer;
  paymentMethod: PaymentMethod;
  cashAgreementAccepted: boolean;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onCashAgreementChange: (accepted: boolean) => void;
};

/** Presentation only. Amounts and eligibility come from the existing quote calculator. */
export default function BookingPaymentOptions({ offer, paymentMethod, cashAgreementAccepted, onPaymentMethodChange, onCashAgreementChange }: Props) {
  const warningId = useId();
  const headingId = useId();
  if (!offer.eligible) return null;
  const cash = formatDepositCashGbp(offer.cashDueGbp);
  const cardClass = (method: PaymentMethod) => `min-w-0 rounded-2xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald ${
    paymentMethod === method ? "border-emerald bg-emerald/15" : "border-white/20 bg-white/[0.03] hover:border-white/40"
  }`;
  return (
    <div className="space-y-2" data-booking-payment-options>
      <p id={headingId} className="text-sm font-semibold text-white">{DEPOSIT_CASH_CHOOSE_HEADING}</p>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-labelledby={headingId}>
        <button type="button" aria-pressed={paymentMethod === PAYMENT_METHOD_DEPOSIT_CASH}
          onClick={() => onPaymentMethodChange(PAYMENT_METHOD_DEPOSIT_CASH)} className={cardClass(PAYMENT_METHOD_DEPOSIT_CASH)}>
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
            {DEPOSIT_CASH_OPTION_LABEL}
            <span className="rounded-full bg-emerald/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald">{DEPOSIT_CASH_BADGE}</span>
          </span>
          <span className="mt-1 block text-sm font-semibold text-emerald">{todayPayLabel(offer.depositGbp)}</span>
          <span className="mt-0.5 block text-sm leading-snug text-white/80">{cash} cash to your driver on pickup</span>
        </button>
        <button type="button" aria-pressed={paymentMethod === PAYMENT_METHOD_FULL_ONLINE}
          onClick={() => onPaymentMethodChange(PAYMENT_METHOD_FULL_ONLINE)} className={cardClass(PAYMENT_METHOD_FULL_ONLINE)}>
          <span className="block text-sm font-semibold text-white">{FULL_ONLINE_OPTION_LABEL}</span>
          <span className="mt-1 block text-sm font-semibold text-emerald">{todayPayLabel(offer.totalFare)}</span>
          <span className="mt-0.5 block text-sm leading-snug text-white/80">Nothing to pay on pickup</span>
          <span className="mt-1 block text-xs leading-snug text-white/70">Secure card payment powered by SumUp.</span>
        </button>
      </div>
      {paymentMethod === PAYMENT_METHOD_DEPOSIT_CASH ? (
        <div className="space-y-1" data-cash-acknowledgement>
          <p id={warningId} className="text-sm leading-snug text-amber-100">Remaining {cash} payable in cash only. Card payments aren’t accepted for the balance.</p>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-snug text-white/90">
            <input type="checkbox" required checked={cashAgreementAccepted} aria-describedby={warningId}
              onChange={(event) => onCashAgreementChange(event.target.checked)}
              className="h-5 w-5 shrink-0 rounded border-white/30 bg-navy-dark text-emerald focus:ring-emerald/30" />
            <span>I agree to pay the {cash} cash balance to my driver on pickup.</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
