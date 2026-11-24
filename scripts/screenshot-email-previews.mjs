// Screenshots each preview (iPhone width) with web fonts loaded: node scripts/screenshot-email-previews.mjs <dir> <outDir>
import { chromium } from "playwright";
import { mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
const [dir, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
for (const name of readdirSync(dir).filter((n) => n.endsWith(".html"))) {
  await page.goto(`file://${resolve(dir, name)}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, name.replace(/\.html$/, ".png")), fullPage: true });
}
await browser.close();
