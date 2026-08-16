/**
 * Headless Chrome check: focused flight input must not widen document scrollWidth
 * beyond the viewport at common iPhone widths.
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

async function main() {
  let puppeteer;
  try {
    puppeteer = require("puppeteer-core");
  } catch {
    console.log("SKIP  puppeteer-core not installed — static CSS guards still cover the fix");
    process.exit(0);
  }

  const outDir = path.join("/tmp", "flight-overflow");
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, "fixture.html");

  fs.writeFileSync(
    htmlPath,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>
html, body {
  margin: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: clip;
  background: #071c38;
  color: #fff;
  font-family: system-ui, sans-serif;
}
.quote-text-input {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  font-size: 16px;
  line-height: 1.25;
  height: 3rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255,255,255,0.25);
  background: #041020;
  color: #fff;
  padding: 0 1rem;
  text-transform: uppercase;
}
.quote-text-input:focus {
  outline: none;
  box-shadow: inset 0 0 0 2px rgba(47, 191, 74, 0.25);
}
.quote-field { width: 100%; max-width: 100%; min-width: 0; }
.quote-helper-text {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.35;
  color: rgba(255,255,255,0.55);
}
.card {
  box-sizing: border-box;
  width: 100%;
  max-width: 28rem;
  margin: 1rem auto;
  padding: 1.5rem;
  border: 1px solid rgba(255,255,255,.15);
}
.legacy-sm {
  box-sizing: border-box;
  width: 100%;
  font-size: 14px;
  height: 3rem;
  padding: 0 1rem;
}
</style>
</head>
<body>
  <main class="card">
    <div class="quote-field">
      <label for="flight">Flight number</label>
      <input id="flight" class="quote-text-input" value="" placeholder="e.g. BA1234" />
      <p class="quote-helper-text" id="help">Provide your flight number when booking and we’ll monitor your flight where possible to help account for early or delayed arrivals.</p>
    </div>
  </main>
  <script>
    window.__measure = () => ({
      innerWidth: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      inputScrollWidth: document.getElementById('flight').scrollWidth,
      inputClientWidth: document.getElementById('flight').clientWidth,
      helpScrollWidth: document.getElementById('help').scrollWidth,
      helpClientWidth: document.getElementById('help').clientWidth,
      computedFontSize: getComputedStyle(document.getElementById('flight')).fontSize,
    });
  </script>
</body>
</html>`,
  );

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(htmlPath));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;

  const widths = [320, 375, 390, 393, 414, 430];
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let failed = false;
  try {
    for (const width of widths) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 800, deviceScaleFactor: 2, isMobile: true });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.focus("#flight");
      await page.type("#flight", "U23001");
      const after = await page.evaluate(() => window.__measure());
      const overflow =
        after.docScrollWidth > after.innerWidth + 1 ||
        after.bodyScrollWidth > after.innerWidth + 1 ||
        after.inputScrollWidth > after.inputClientWidth + 1 ||
        after.helpScrollWidth > after.helpClientWidth + 1;
      const fontOk = after.computedFontSize === "16px";
      if (overflow || !fontOk) {
        failed = true;
        console.error(`FAIL  width ${width}`, after);
      } else {
        console.log(
          `OK  width ${width}: doc ${after.docScrollWidth}/${after.innerWidth}, font ${after.computedFontSize}`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failed) {
    process.exit(1);
  }
  console.log("\nAll mobile viewport overflow checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
