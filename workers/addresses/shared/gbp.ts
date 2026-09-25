/**
 * Shared GBP rounding / display helpers.
 * Use everywhere amounts must agree to the penny.
 */

/** Round to the nearest penny (2 decimal places). */
export function roundGbp(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/** Convert a GBP amount to integer pennies after penny rounding. */
export function gbpToPence(amount: number): number {
  return Math.round(roundGbp(amount) * 100);
}

/** Convert integer pennies back to a penny-rounded GBP amount. */
export function penceToGbp(pence: number): number {
  return roundGbp((Number(pence) || 0) / 100);
}

/** True when the amount is an exact whole-pound GBP value (xx.00). */
export function isWholePoundGbp(amount: number): boolean {
  return gbpToPence(amount) % 100 === 0;
}

/**
 * Customer-facing currency label.
 * Whole pounds → £241; pence → always two digits (£179.50, never £179.5).
 */
export function formatGbpAmount(amount: number): string {
  const rounded = roundGbp(amount);
  if (!Number.isFinite(rounded)) return "£—";
  const asPence = Math.round(rounded * 100);
  if (asPence % 100 === 0) {
    return `£${asPence / 100}`;
  }
  return `£${(asPence / 100).toFixed(2)}`;
}

/**
 * Always two decimal places (£15.00, £35.10).
 * Display-only — do not use this to change amounts sent to SumUp.
 */
export function formatGbpAmountExact(amount: number): string {
  const rounded = roundGbp(amount);
  if (!Number.isFinite(rounded)) return "£—";
  return `£${rounded.toFixed(2)}`;
}
