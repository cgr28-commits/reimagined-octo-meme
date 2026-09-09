/**
 * Visual helpers for quote Step 1–3 field / step highlighting.
 * Colour alone is not the only cue — pair with aria-current / aria-invalid / labels.
 */

export type QuoteFieldHighlightState = "default" | "needs" | "complete" | "error";

/** Shared shell for rounded text/date inputs (fixed height — no layout shift). */
export function quoteTextFieldClass(state: QuoteFieldHighlightState): string {
  // max-w-full + min-w-0: native date/time controls have a large intrinsic min-width.
  // Prefer quoteDateTimeFieldShellClass for type=date|time — Safari often ignores min-width
  // on those replaced controls, so the visible border must live on a wrapping shell.
  const base =
    "quote-text-input box-border h-12 w-full min-w-0 max-w-full rounded-[0.75rem] bg-white/[0.1] px-4 text-base text-white outline-none transition-[border-color,box-shadow] duration-150 [color-scheme:dark]";
  switch (state) {
    case "error":
      return `${base} border border-red-400/70 ring-1 ring-inset ring-red-400/35 focus:border-red-400 focus:ring-red-400/45`;
    case "needs":
      return `${base} border border-emerald/65 ring-1 ring-inset ring-emerald/30 focus:border-emerald focus:ring-emerald/40`;
    case "complete":
      return `${base} border border-emerald/45 focus:border-emerald/70 focus:ring-1 focus:ring-inset focus:ring-emerald/35`;
    default:
      return `${base} border border-white/30 focus:border-emerald/70 focus:ring-1 focus:ring-inset focus:ring-emerald/35`;
  }
}

/**
 * Visible chrome for native date/time inputs.
 * iOS/WebKit date|time controls keep an intrinsic min-width that can exceed the
 * form column; borders on the <input> itself then clip under overflow-x-clip.
 * Put border/radius on this shell (overflow:hidden) and keep the input borderless.
 */
export function quoteDateTimeFieldShellClass(state: QuoteFieldHighlightState): string {
  const base =
    "quote-datetime-shell box-border w-full min-w-0 max-w-full overflow-hidden rounded-[0.75rem] bg-white/[0.1] transition-[border-color,box-shadow] duration-150";
  switch (state) {
    case "error":
      return `${base} border border-red-400/70 ring-1 ring-inset ring-red-400/35 focus-within:border-red-400`;
    case "needs":
      return `${base} border border-emerald/65 ring-1 ring-inset ring-emerald/30 focus-within:border-emerald`;
    case "complete":
      return `${base} border border-emerald/45 focus-within:border-emerald/70 focus-within:ring-1 focus-within:ring-inset focus-within:ring-emerald/35`;
    default:
      return `${base} border border-white/30 focus-within:border-emerald/70 focus-within:ring-1 focus-within:ring-inset focus-within:ring-emerald/35`;
  }
}

/** Inner control for date/time — no border; shell owns the visible edge. */
export function quoteDateTimeInputClass(): string {
  return "quote-text-input quote-datetime-input box-border block h-12 w-full min-w-0 max-w-full border-0 bg-transparent px-4 text-[1.125rem] font-semibold leading-[3rem] text-white outline-none [color-scheme:dark]";
}

/** Booking panel text inputs (slightly stronger default border). */
export function bookingTextFieldClass(state: QuoteFieldHighlightState): string {
  const base =
    "quote-text-input box-border h-12 w-full min-w-0 max-w-full rounded-[0.75rem] bg-navy-light px-4 text-white placeholder:text-white/65 outline-none transition-[border-color,box-shadow] duration-150";
  switch (state) {
    case "error":
      return `${base} border border-red-400/70 ring-1 ring-inset ring-red-400/35 focus:border-red-400`;
    case "needs":
      return `${base} border border-emerald/65 ring-1 ring-inset ring-emerald/30 focus:border-emerald focus:ring-2 focus:ring-inset focus:ring-emerald/35`;
    case "complete":
      return `${base} border border-emerald/45 focus:border-emerald focus:ring-2 focus:ring-inset focus:ring-emerald/30`;
    default:
      return `${base} border border-white/32 focus:border-emerald focus:ring-2 focus:ring-inset focus:ring-emerald/30 md:border-white/38`;
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
    "rounded-[0.75rem] border bg-white/[0.14] transition-[border-color,box-shadow] duration-150";
  const focusGlow =
    "focus-within:border-emerald focus-within:ring-2 focus-within:ring-emerald/50 focus-within:shadow-[0_0_0_3px_rgba(47,191,74,0.22)]";
  if (options.hasError) {
    return `${base} border-red-400/70 ring-1 ring-red-400/35`;
  }
  if (options.needsCompletion) {
    return `${base} border-emerald/75 ring-1 ring-emerald/45 ${focusGlow}`;
  }
  if (options.isActiveUi) {
    return `${base} border-emerald ring-2 ring-emerald/50 shadow-[0_0_0_3px_rgba(47,191,74,0.22)]`;
  }
  if (options.isComplete) {
    return `${base} border-emerald/60 ${focusGlow}`;
  }
  return `${base} border-white/32 ${focusGlow}`;
}

/** Soft emerald outline around a choice-card group that still needs a selection. */
export function choiceGroupNeedsClass(needsCompletion: boolean, hasError = false): string {
  // Always keep the same padding/border box so completing a choice does not shift layout.
  if (hasError) {
    return "rounded-2xl border border-red-400/70 bg-red-500/[0.08] p-2 ring-1 ring-red-400/35";
  }
  if (needsCompletion) {
    return "rounded-2xl border border-emerald/55 bg-emerald/[0.06] p-2 ring-1 ring-emerald/25";
  }
  return "rounded-2xl border border-transparent p-2";
}

export const QUOTE_CHOICE_OFF =
  "quote-choice border-white/26 bg-white/[0.07] text-white hover:border-emerald/50 hover:bg-emerald/10";
export const QUOTE_CHOICE_ON =
  "quote-choice-selected border-emerald bg-emerald text-navy shadow-[0_0_0_3px_rgba(47,191,74,0.22)]";
