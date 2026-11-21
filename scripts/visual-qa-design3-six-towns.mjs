/** Visual QA: Design 3 for Lisburn / Ballyclare / Antrim (+ refs) at 390 / 768 / 1440. */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const base = process.env.TEST_BASE_URL || "http://localhost:3020";
const outDir = join(process.cwd(), "visual-qa/design3-six-towns");
mkdirSync(outDir, { recursive: true });

const pages = [
  ["lisburn", "/locations/lisburn-airport-taxis/"],
  ["ballyclare", "/locations/ballyclare-airport-taxis/"],
  ["antrim", "/locations/antrim-airport-taxis/"],
  ["holywood", "/locations/holywood-airport-taxis/"],
  ["newtownards", "/locations/newtownards-airport-taxis/"],
  ["dundonald", "/locations/dundonald-airport-taxis/"],
  ["comber", "/locations/comber-airport-taxis/"],
];
const viewports = [
  ["mobile", 390, 844],
  ["tablet", 768, 1024],
  ["desktop", 1440, 900],
];

const browser = await chromium.launch({ headless: true });
const report = [];

for (const [name, path] of pages) {
  for (const [label, width, height] of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: label === "mobile" ? 2 : 1,
      isMobile: label === "mobile",
      hasTouch: label !== "desktop",
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      localStorage.setItem("matni-cookie-consent-v1", "rejected");
      localStorage.setItem("matni-mobile-design", "d3");
    });
    const page = await context.newPage();
    await page.goto(`${base}${path}?mobile=d3`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator("#quote-section-passengers").waitFor({ timeout: 60000 });
    if (width < 1200) {
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-mobile-d3", "");
        document.documentElement.setAttribute("data-mobile-light", "");
      });
    }
    await page.waitForTimeout(500);
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector("section.homepage-hero");
      const h1 = document.querySelector("#homepage-booking-intro > h1, .homepage-hero h1");
      const cta = document.querySelector("[data-get-fixed-price]");
      const bg = hero ? getComputedStyle(hero).getPropertyValue("--design3-hero-image").trim() : "";
      return {
        design3: hero?.hasAttribute("data-design3-town-hero") ?? false,
        roomy: hero?.hasAttribute("data-desktop-roomy") ?? false,
        heroImage: bg,
        h1: (h1?.textContent || "").replace(/\s+/g, " ").trim(),
        h1Overflow: h1 ? h1.scrollWidth > h1.clientWidth + 2 : null,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        ctaDisabled: cta ? cta.disabled : null,
        ctaVisible: cta ? getComputedStyle(cta).display !== "none" : false,
      };
    });
    const file = join(outDir, `${name}-${label}-${width}x${height}.png`);
    await page.screenshot({
      path: file,
      clip: { x: 0, y: 0, width, height: Math.min(height, label === "desktop" ? 900 : height) },
    });
    report.push({ name, label, width, height, file, ...metrics });
    console.log(JSON.stringify({ name, label, ...metrics }));
    await context.close();
  }
}

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log("wrote", join(outDir, "report.json"));
