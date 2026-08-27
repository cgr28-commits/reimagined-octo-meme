/**
 * Visual helpers for quote Step 1–3 field / step highlighting.
 * Colour alone is not the only cue — pair with aria-current / aria-invalid / labels.
 */

export type QuoteFieldHighlightState = "default" | "needs" | "complete" | "error";

/** Shared shell for rounded text/date inputs (fixed height — no layout shift). */
export function quoteTextFieldClass(state: QuoteFieldHighlightState): string {
  // max-w-full + min-w-0: native date/time controls have a large intrinsic min-width;
  // without these they overflow grid cells. ring-inset keeps focus rings inside the box
  // so form overflow-x-clip cannot hide the right border/radius.
  const base =
    "quote-text-input box-border h-12 w-full min-w-0 max-w-full rounded-[0.75rem] bg-white/[0.045] px-4 text-base text-white outline-none transition-[border-color,box-shadow] duration-150 [color-scheme:dark]";
  switch (state) {
    case "error":
      return `${base} border border-red-400/55 ring-1 ring-inset ring-red-400/30 focus:border-red-400/70 focus:ring-red-400/40`;
    case "needs":
      return `${base} border border-emerald/50 ring-1 ring-inset ring-emerald/25 focus:border-emerald focus:ring-emerald/35`;
    case "complete":
      return `${base} border border-emerald/30 focus:border-emerald/50 focus:ring-1 focus:ring-inset focus:ring-emerald/30`;
    default:
      return `${base} border border-white/12 focus:border-emerald/50 focus:ring-1 focus:ring-inset focus:ring-emerald/30`;
  }
}

/** Booking panel text inputs (slightly stronger default border). */
export function bookingTextFieldClass(state: QuoteFieldHighlightState): string {
  const base =
    "quote-text-input box-border h-12 w-full min-w-0 max-w-full rounded-[0.75rem] bg-navy-dark px-4 text-white placeholder:text-white/45 outline-none transition-[border-color,box-shadow] duration-150";
  switch (state) {
    case "error":
      return `${base} border border-red-400/55 ring-1 ring-inset ring-red-400/30 focus:border-red-400/70`;
    case "needs":
      return `${base} border border-emerald/50 ring-1 ring-inset ring-emerald/25 focus:border-emerald focus:ring-2 focus:ring-inset focus:ring-emerald/30`;
    case "complete":
      return `${base} border border-emerald/35 focus:border-emerald focus:ring-2 focus:ring-inset focus:ring-emerald/25`;
    default:
      return `${base} border border-white/22 focus:border-emerald focus:ring-2 focus:ring-inset focus:ring-emerald/25 md:border-white/28`;
  }
}

/** AddressInput outer shell (border lives on the wrapper around the combobox). */
export function addressFieldShellClass(options: {
  hasError: boolean;
  needsCompletion: boolean;
  isComplete: boolean;
  isActiveUi: boolean;
}): string {
  const base =
    "rounded-[0.75rem] border bg-white/[0.045] transition-[border-color,box-shadow] duration-150";
  if (options.hasError) {
    return `${base} border-red-400/55 ring-1 ring-red-400/30`;
  }
  if (options.needsCompletion) {
    return `${base} border-emerald/50 ring-1 ring-emerald/25`;
  }
  if (options.isActiveUi) {
    return `${base} border-emerald/50 ring-1 ring-emerald/30`;
  }
  if (options.isComplete) {
    return `${base} border-emerald/30 focus-within:border-emerald/50 focus-within:ring-1 focus-within:ring-emerald/30`;
  }
  return `${base} border-white/12 focus-within:border-emerald/50 focus-within:ring-1 focus-within:ring-emerald/30`;
}

/** Soft emerald outline around a choice-card group that still needs a selection. */
export function choiceGroupNeedsClass(needsCompletion: boolean): string {
  // Always keep the same padding/border box so completing a choice does not shift layout.
  if (needsCompletion) {
    return "rounded-2xl border border-emerald/45 bg-emerald/[0.04] p-2 ring-1 ring-emerald/20";
  }
  return "rounded-2xl border border-transparent p-2";
}
