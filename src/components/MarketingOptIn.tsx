type MarketingOptInProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export default function MarketingOptIn({ checked, onCheckedChange }: MarketingOptInProps) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 px-1 py-1 text-left sm:px-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-white/40 bg-navy-dark text-emerald focus:ring-emerald/30"
      />
      <span className="text-xs leading-snug quote-secondary sm:text-sm">
        Send me occasional offers and travel updates (optional)
      </span>
    </label>
  );
}
