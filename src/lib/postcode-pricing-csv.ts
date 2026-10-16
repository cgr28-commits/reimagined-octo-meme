import { validatePostcodeRules, postcodeRuleApproval, type PostcodePricingRule } from "../../shared/postcode-pricing";

const columns = ["district", "airportCode", "direction", "saloonFareGbp", "approvalStatus", "enabled", "updatedAt"];
export function exportPostcodeCsv(rules: PostcodePricingRule[]): string {
  return [columns.join(","), ...rules.map(r => [r.district, r.airportCode, r.direction ?? "to-airport", r.saloonFareGbp.toFixed(2), postcodeRuleApproval(r), String(r.enabled), r.updatedAt ?? ""].join(","))].join("\r\n") + "\r\n";
}

/** Strict schema; quoted fields/CRLF supported. All imports are inactive and require approval.
 * Import is merge-only in the UI, never a replacement of existing keys.
 */
export function importPostcodeCsv(text: string): PostcodePricingRule[] {
  if (text.length > 300000) throw new Error("CSV must be smaller than 300 KB.");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(cell); cell = "";
      if (c !== ",") { if (row.some(v => v.trim())) rows.push(row); row = []; if (c === "\r" && text[i + 1] === "\n") i++; }
    } else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  const header = rows.shift()?.map(v => v.replace(/^\uFEFF/, "").trim());
  if (!header || header.join(",") !== columns.join(",")) throw new Error(`CSV header must be: ${columns.join(",")}`);
  if (!rows.length) throw new Error("CSV contains no fares.");
  const rules = rows.map((r, i) => {
    if (r.length !== columns.length || !/^\d+(?:\.\d{1,2})?$/.test(r[3].trim()) || !["true", "false"].includes(r[5].trim()) || !["approved", "draft", "needs-verification"].includes(r[4].trim())) throw new Error(`Invalid CSV row ${i + 2}.`);
    return { district: r[0].trim(), airportCode: r[1].trim(), direction: r[2].trim(), saloonFareGbp: Number(r[3]), approvalStatus: "needs-verification", enabled: false };
  });
  const checked = validatePostcodeRules(rules);
  if (checked.errors.length) throw new Error(checked.errors[0]);
  return checked.rules;
}
