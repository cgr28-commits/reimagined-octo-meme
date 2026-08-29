/**
 * Shared GBP rounding / display helpers.
 * Use everywhere amounts must agree to the penny.
 */

/** Round to the nearest penny (2 decimal places). */
export function roundGbp(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
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
