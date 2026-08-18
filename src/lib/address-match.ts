/**
 * Shared address-match helpers for Places autocomplete (Quick Quote + public quote).
 */

export function normalizeAddressKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,/#]/g, " ")
    .replace(/\b(united kingdom|uk|northern ireland|ireland)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact / high-confidence match between pasted text and a Places prediction. */
export function isHighConfidenceAddressMatch(
  query: string,
  prediction: {
    description: string;
    mainText: string;
    secondaryText?: string;
  },
): boolean {
  const q = normalizeAddressKey(query);
  if (q.length < 10 || !/\d/.test(q)) return false;
  const desc = normalizeAddressKey(prediction.description);
  const main = normalizeAddressKey(prediction.mainText);
  const secondary = normalizeAddressKey(prediction.secondaryText || "");
  if (desc === q || main === q) return true;

  const qPc = q.match(/\b(bt\d{1,2}\s*\d[a-z]{2})\b/);
  const dPc = desc.match(/\b(bt\d{1,2}\s*\d[a-z]{2})\b/);
  const qNum = q.match(/^(\d+[a-z]?)\b/);
  const mNum = main.match(/^(\d+[a-z]?)\b/);
  if (qPc && dPc && qNum && mNum) {
    const samePc = qPc[1].replace(/\s+/g, "") === dPc[1].replace(/\s+/g, "");
    if (samePc && qNum[1] === mNum[1]) return true;
  }

  if (desc.includes(q)) return true;
  if (`${main} ${secondary}`.includes(q) && qPc && dPc) return true;
  return false;
}
