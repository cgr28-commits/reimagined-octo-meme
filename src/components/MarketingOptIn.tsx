import Link from "next/link";

type MarketingOptInProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export default function MarketingOptIn({ checked, onCheckedChange }: MarketingOptInProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-navy-dark text-emerald focus:ring-emerald/30"
      />
      <span className="text-sm leading-relaxed text-white/70">
        Keep me updated with occasional offers, travel tips and news from My Airport Taxi NI. You
        can unsubscribe at any time via our{" "}
        <Link
          href="/unsubscribe/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-emerald underline decoration-emerald/40 underline-offset-2 hover:text-emerald-light"
        >
          unsubscribe page
        </Link>{" "}
        or by emailing us. Optional — not required to complete your booking.
      </span>
    </label>
  );
}
