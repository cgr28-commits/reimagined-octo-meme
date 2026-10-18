import assert from "node:assert/strict";
import { scrollJourneySummaryAfterTimeConfirm, QUOTE_REVEAL_SCROLL_MS } from "../src/lib/quote-step-nav-scroll";

// Model a long upward movement after a mobile native time picker closes.
let y = 2200;
let reduced = false;
let id = 0;
const frames = new Map<number, FrameRequestCallback>();
const listeners = new Map<string, Set<() => void>>();
const positions: number[] = [];
const style = { scrollBehavior: "smooth" };
class ElementStub {
  constructor(private top: number, private bottom = top + 40) {}
  getBoundingClientRect() { return { top: this.top - y, bottom: this.bottom - y }; }
  getClientRects() { return [this.getBoundingClientRect()]; }
  matches() { return false; }
  querySelector() { return null; }
  blur() {}
}
const summary = new ElementStub(500);
const cta = new ElementStub(1050, 1100);
const header = new ElementStub(0, 100);
header.getBoundingClientRect = () => ({ top: 0, bottom: 100 });
Object.assign(globalThis, {
  HTMLElement: ElementStub,
  document: {
    activeElement: null,
    querySelector: () => header,
    getElementById: (key: string) => key === "summary" ? summary : cta,
    documentElement: { style, clientHeight: 800, scrollHeight: 4000 },
  },
  window: {
    get scrollY() { return y; },
    innerHeight: 800,
    visualViewport: { height: 800, offsetTop: 0 },
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (key: number) => frames.delete(key),
    scrollTo: (_x: number, next: number) => { y = next; positions.push(next); },
    addEventListener: (key: string, fn: () => void) => {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(fn);
    },
    removeEventListener: (key: string, fn: () => void) => listeners.get(key)?.delete(fn),
  },
});
function frame(now: number) {
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(fn => fn(now));
}
function begin() { frame(performance.now()); frame(performance.now()); }
const cancel = scrollJourneySummaryAfterTimeConfirm("summary", "cta");
begin();
assert.equal(y, 2200, "Long movement must wait for animation, rather than jump");
const start = performance.now();
frame(start + QUOTE_REVEAL_SCROLL_MS / 2);
assert.ok(y > 316 && y < 2200, "Intermediate position must lie between start and destination");
frame(start + QUOTE_REVEAL_SCROLL_MS + 100);
assert.equal(y, 316, "Existing Continue visibility clamp must be preserved");
assert.equal(style.scrollBehavior, "smooth", "Restore original page motion after animation");
cancel();

// A swipe cancels the glide immediately, including its pending animation frame.
y = 2200;
scrollJourneySummaryAfterTimeConfirm("summary", "cta"); begin();
frame(performance.now() + 200);
for (const fn of [...(listeners.get("touchstart") ?? [])]) fn();
const interrupted = y;
frame(performance.now() + 1000);
assert.equal(y, interrupted);
assert.equal(frames.size, 0);
assert.equal(style.scrollBehavior, "smooth");

// Reduced motion retains the exact same destination without animation.
y = 2200; reduced = true;
scrollJourneySummaryAfterTimeConfirm("summary", "cta"); begin();
assert.equal(y, 316);
assert.equal(frames.size, 0);
assert.equal(style.scrollBehavior, "smooth");
console.log("OK time confirmation: long glide, destination clamp, swipe cancellation and reduced motion");

// Combined checkout: stop at Your details, without the legacy Continue clamp.
y = 2200; reduced = false;
scrollJourneySummaryAfterTimeConfirm(summary as unknown as HTMLElement, null); begin();
frame(performance.now() + QUOTE_REVEAL_SCROLL_MS + 100);
assert.equal(y, 384, "Your details must align below the fixed header, without skipping the name");
assert.equal(style.scrollBehavior, "smooth");
y = 2200; reduced = true;
scrollJourneySummaryAfterTimeConfirm(summary as unknown as HTMLElement, null); begin();
assert.equal(y, 384, "Reduced motion must stop at the same Your details heading");
console.log("OK combined checkout: Your details heading remains below the header");
