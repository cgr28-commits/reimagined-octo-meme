"use client";

import {
  CARD_BALANCE_BADGE,
  CARD_BALANCE_OPTION_LABEL,
  cardBalanceAgreementLabel,
  cardBalanceExplainer,
  cardBalanceOptionSubline,
  type CardBalanceQuote,
} from "../../shared/deposit-card-balance";
import { formatGbpAmountExact } from "../../shared/gbp";

type Props = {
  offer: CardBalanceQuote;
  dueDateLabel: string;
  depositSelected: boolean;
  agreementAccepted: boolean;
  disabled?: boolean;
  onSelectDeposit: (deposit: boolean) => void;
  onAgreementChange: (accepted: boolean) => void;
};

/** "Pay a deposit" vs "Pay in full" for bookings 30+ days ahead (held-price / quick-quote pages). */
export default function CardBalancePaymentChoice({
  offer,
  dueDateLabel,
  depositSelected,
  agreementAccepted,
  disabled,
  onSelectDeposit,
  onAgreementChange,
}: Props) {
  const card = (active: boolean) =>
    `min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors ${
      active ? "border-emerald bg-emerald/15" : "border-white/20 bg-white/[0.03] hover:border-white/40"
    }`;
  return (
    <div className="space-y-3" data-card-balance-choice>
      <p className="text-sm font-semibold text-white">Choose how you&apos;d like to pay</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          data-card-balance-option
          aria-pressed={depositSelected}
          onClick={() => onSelectDeposit(true)}
          className={card(depositSelected)}
        >
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
            {CARD_BALANCE_OPTION_LABEL}
            <span className="rounded-full bg-emerald/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald">
              {CARD_BALANCE_BADGE}
            </span>
          </p>
          <p className="mt-2 text-sm font-semibold text-emerald">{formatGbpAmountExact(offer.depositGbp)} today</p>
          <p className="mt-0.5 text-xs text-white/70">{cardBalanceOptionSubline(offer.balanceGbp)}</p>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!depositSelected}
          onClick={() => onSelectDeposit(false)}
          className={card(!depositSelected)}
        >
          <p className="text-sm font-semibold text-white">Pay in Full Online</p>
          <p className="mt-2 text-sm font-semibold text-emerald">{formatGbpAmountExact(offer.totalFare)} today</p>
          <p className="mt-0.5 text-xs text-white/70">Nothing more to pay</p>
        </button>
      </div>
      {depositSelected ? (
        <div className="space-y-1.5 rounded-xl border border-amber-300/35 bg-amber-500/10 px-2.5 py-2">
          <p className="text-xs leading-snug text-white/80">{cardBalanceExplainer(offer.balanceGbp, dueDateLabel)}</p>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm leading-snug text-white/92">
            <input
              type="checkbox"
              checked={agreementAccepted}
              aria-required="true"
              onChange={(event) => onAgreementChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-navy-dark text-emerald focus:ring-emerald/30"
            />
            <span>{cardBalanceAgreementLabel(offer.balanceGbp)}</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
