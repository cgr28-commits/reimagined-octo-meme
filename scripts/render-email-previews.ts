/**
 * Writes before/after HTML previews of customer emails with the premium typography pass.
 *   EMAIL_PREVIEW_OUTPUT=dir npx tsx scripts/check-email-logo.ts   (builds the raw emails)
 *   npx tsx scripts/render-email-previews.ts <rawDir> <outDir>
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { polishCustomerEmailHtml } from "../shared/email-polish";

const [rawDir, outDir] = process.argv.slice(2);
mkdirSync(join(outDir, "before"), { recursive: true });
mkdirSync(join(outDir, "after"), { recursive: true });
for (const name of readdirSync(rawDir).filter((n) => n.endsWith(".html"))) {
  const html = readFileSync(join(rawDir, name), "utf8");
  writeFileSync(join(outDir, "before", name), html);
  const polished = polishCustomerEmailHtml(html);
  if (polishCustomerEmailHtml(polished) !== polished) throw new Error(`${name}: polish is not idempotent`);
  writeFileSync(join(outDir, "after", name), polished);
}
console.log("Email previews written to", outDir);
