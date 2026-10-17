import assert from "node:assert/strict";
import { scheduleQuoteRevealScroll } from "../src/lib/quote-step-nav-scroll";

// Run the actual animation with a changing viewport, without a browser/network.
const original = Object.getOwnPropertyDescriptors(globalThis);
const frames = new Map<number, FrameRequestCallback>(), timers = new Map<number, () => void>();
const listeners = new Map<string, () => void>();
let id = 0, y = 100, height = 744, measurements = 0, actionShift = 0;
class Element {
  getClientRects() { return [{}]; }
  getBoundingClientRect() { return { top: 1000 - y, bottom: 1020 - y }; }
}
const heading = new Element(), action = new Element(), header = new Element();
heading.getBoundingClientRect = () => { measurements++; return { top: 1000 - y, bottom: 1020 - y }; };
action.getBoundingClientRect = () => ({ top: 1700 + actionShift - y, bottom: 1756 + actionShift - y });
header.getBoundingClientRect = () => ({ top: 0, bottom: 72 });
const root = { style: { scrollBehavior: "smooth", overflowAnchor: "auto" }, clientHeight: 844, scrollHeight: 5000 };
const win = {
  get scrollY() { return y; }, innerHeight: 844,
  visualViewport: { get height() { return height; }, offsetTop: 0 },
  matchMedia: (q: string) => ({ matches: q.includes("max-width") }),
  getComputedStyle: () => ({ getPropertyValue: () => "0" }),
  scrollTo: (_x: number, next: number) => { y = next; },
  requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; },
  cancelAnimationFrame: (key: number) => frames.delete(key),
  setTimeout: (fn: () => void) => { timers.set(++id, fn); return id; },
  clearTimeout: (key: number) => timers.delete(key),
  addEventListener: (key: string, fn: () => void) => listeners.set(key, fn),
  removeEventListener: (key: string) => listeners.delete(key),
};
try {
  Object.defineProperties(globalThis, {
    window: { value: win, configurable: true },
    document: { value: { documentElement: root, getElementById: () => heading, querySelector: (q: string) => q.startsWith("header") ? header : heading, querySelectorAll: () => [action] }, configurable: true },
    HTMLElement: { value: Element, configurable: true },
    performance: { value: { now: () => 0 }, configurable: true },
  });
  const cancel = scheduleQuoteRevealScroll({ onConsume() {}, onRetry() {} });
  timers.forEach(fn => fn()); timers.clear();
  const positions: number[] = [];
  for (let now = 0; now <= 1200; now += 16) {
    if (now >= 600) height = 650;
    const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(now));
    positions.push(y);
  }
  assert.equal(measurements, 1, "No per-frame layout measurement or moving document target");
  assert.equal(1000 - y, 84, "Vehicle choices must stay below the fixed header");
  assert.ok(1700 - y >= 84);
  assert.ok(positions.every((value, i) => i === 0 || value >= positions[i - 1]), "Glide must not reverse");
  assert.equal(root.style.overflowAnchor, "auto");
  assert.equal(root.style.scrollBehavior, "smooth");
  cancel();

  let layoutChanged = () => {}, disconnected = false;
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
    constructor(callback: () => void) { layoutChanged = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  } });
  y = 100; measurements = 0;
  const lateLayout = scheduleQuoteRevealScroll({ onConsume() {}, onRetry() {} });
  timers.forEach(fn => fn()); timers.clear();
  for (let now = 0; now <= 1200; now += 16) {
    if (now === 608) { actionShift = 160; layoutChanged(); }
    const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(now));
  }
  assert.equal(measurements, 2, "Only a real late layout change triggers another measurement");
  assert.equal(1000 - y, 84, "Late content must not scroll past the vehicle choices");
  assert.ok(disconnected, "Observer must stop when the glide ends");
  lateLayout();

  const stop = scheduleQuoteRevealScroll({ onConsume() {}, onRetry() {} });
  timers.forEach(fn => fn()); timers.clear();
  for (let i = 0; i < 3; i++) { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(16 * i)); }
  listeners.get("touchstart")?.();
  assert.equal(frames.size, 0);
  assert.equal(root.style.overflowAnchor, "auto");
  stop();
  console.log("OK stable reveal with changing iPhone viewport, no per-frame layout, touch cancellation and restored anchoring");
} finally {
  for (const key of ["window", "document", "HTMLElement", "performance", "ResizeObserver"]) {
    if (original[key]) Object.defineProperty(globalThis, key, original[key]);
    else Reflect.deleteProperty(globalThis, key);
  }
}
