"""Temporary review script (scratch branch only): real Safari (safaridriver) screenshots of the
homepage hero, served from the local static export. No typing, so no address or quote calls."""
import json, os, time
from selenium import webdriver

BASE = os.environ.get("BASE", "http://127.0.0.1:3000")
OUT = "test-results/safari-check/safari"
os.makedirs(OUT, exist_ok=True)
d = webdriver.Safari()
report = []
try:
    d.get(BASE + "/")
    d.execute_script("localStorage.setItem('matni-cookie-consent-v1','rejected')")
    for w, h in [(1280, 800), (1440, 900), (1920, 1080)]:
        d.set_window_size(w, h + 80)
        d.get(BASE + "/")
        time.sleep(4)
        info = d.execute_script("""
          const h1=document.querySelector('#homepage-booking-intro > h1');
          const card=document.querySelector('#quote [data-quote-presentation="homepage"]');
          const btn=document.querySelector('button[data-get-fixed-price]');
          const r=card.getBoundingClientRect();
          return {viewport: innerWidth, h1Font: getComputedStyle(h1).fontFamily.slice(0,40), h1Weight: getComputedStyle(h1).fontWeight,
                  cardLeft: Math.round(r.left), cardWidth: Math.round(r.width), cardRightEdgeInView: r.right <= innerWidth,
                  btnFill: getComputedStyle(btn).webkitTextFillColor, btnColor: getComputedStyle(btn).color,
                  overflow: document.documentElement.scrollWidth > innerWidth,
                  safari: navigator.userAgent};""")
        report.append(info)
        d.save_screenshot(f"{OUT}/safari-fresh-{info['viewport']}.png")
finally:
    d.quit()
    with open(f"{OUT}/report.json", "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
