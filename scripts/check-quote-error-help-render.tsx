/**
 * Rendered component checks for quote error help / Start New Quote uniqueness.
 * Uses react-dom/server renderToStaticMarkup (not source-regex alone).
 * Run: npx tsx scripts/check-quote-error-help-render.tsx
 */

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BookingErrorHelpCluster,
  BookingErrorWhatsAppHelp,
  StartNewQuoteControls,
} from "../src/components/QuoteBookingHelpControls";

function countMatches(html: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return (html.match(new RegExp(pattern.source, flags)) ?? []).length;
}

function noop() {}

/** Mirrors QuoteCard placement rules: error cluster OR results Start New Quote — never both. */
function QuoteHelpSurface(props: {
  mode: "results" | "error";
  confirmOpen?: boolean;
}) {
  const confirmOpen = Boolean(props.confirmOpen);
  if (props.mode === "error") {
    return createElement(
      "div",
      { "data-quote-surface": "error" },
      createElement("p", { role: "alert" }, "We couldn’t start payment. Please try again."),
      createElement(BookingErrorHelpCluster, {
        confirmOpen,
        onRequestStart: noop,
        onCancelConfirm: noop,
        onConfirmStart: noop,
      }),
      // Map / payment regions must not repeat Start New Quote during an error.
      createElement("div", { "data-map": true }),
      createElement("div", { "data-payment": true }),
    );
  }

  return createElement(
    "div",
    { "data-quote-surface": "results" },
    // Single Start New Quote near the top of quote results.
    createElement(StartNewQuoteControls, {
      confirmOpen,
      onRequestStart: noop,
      onCancelConfirm: noop,
      onConfirmStart: noop,
    }),
    createElement("div", { "data-map": true }),
    createElement("div", { "data-payment": true }),
  );
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

check("Error-free results: one Start New Quote, no WhatsApp panel", () => {
  const html = renderToStaticMarkup(
    createElement(QuoteHelpSurface, { mode: "results" }),
  );
  assert.equal(countMatches(html, /data-start-new-quote-controls/g), 1);
  assert.equal(countMatches(html, /Clear Details &amp; Start a New Quote/g), 1);
  assert.equal(countMatches(html, /data-booking-error-whatsapp-help/g), 0);
  assert.equal(countMatches(html, /Get Booking Help on WhatsApp/g), 0);
  assert.equal(countMatches(html, /data-booking-error-help-cluster/g), 0);
  assert.doesNotMatch(html, /role="alertdialog"/);
});

check("Error surface: one WhatsApp panel and one Start New Quote together", () => {
  const html = renderToStaticMarkup(
    createElement(QuoteHelpSurface, { mode: "error" }),
  );
  assert.equal(countMatches(html, /data-booking-error-help-cluster/g), 1);
  assert.equal(countMatches(html, /data-booking-error-whatsapp-help/g), 1);
  assert.equal(countMatches(html, /Get Booking Help on WhatsApp/g), 1);
  assert.equal(countMatches(html, /data-start-new-quote-controls/g), 1);
  assert.equal(countMatches(html, /Clear Details &amp; Start a New Quote/g), 1);
  // Map/payment placeholders present but must not add extra controls.
  assert.match(html, /data-map/);
  assert.match(html, /data-payment/);
});

check("Confirm dialog ids occur only once per rendered page", () => {
  const html = renderToStaticMarkup(
    createElement(QuoteHelpSurface, { mode: "results", confirmOpen: true }),
  );
  assert.equal(countMatches(html, /role="alertdialog"/g), 1);
  assert.equal(countMatches(html, /data-start-new-quote-confirm/g), 1);
  assert.equal(countMatches(html, /Keep Current Quote/g), 1);
  // useId-generated ids appear exactly once each via aria attributes + element ids.
  const labelledBy = html.match(/aria-labelledby="([^"]+)"/);
  const describedBy = html.match(/aria-describedby="([^"]+)"/);
  assert.ok(labelledBy?.[1], "expected aria-labelledby");
  assert.ok(describedBy?.[1], "expected aria-describedby");
  const titleId = labelledBy![1];
  const descId = describedBy![1];
  assert.notEqual(titleId, descId);
  assert.equal(countMatches(html, new RegExp(`id="${titleId}"`, "g")), 1);
  assert.equal(countMatches(html, new RegExp(`id="${descId}"`, "g")), 1);
  // Legacy hard-coded ids must not appear (duplicate risk across call sites).
  assert.doesNotMatch(html, /id="start-new-quote-title"/);
  assert.doesNotMatch(html, /id="start-new-quote-desc"/);
});

check("WhatsApp help alone never appears on error-free markup", () => {
  const lonely = renderToStaticMarkup(
    createElement(BookingErrorWhatsAppHelp, {}),
  );
  assert.match(lonely, /data-booking-error-whatsapp-help/);
  // Error-free fixture must not include that panel (guards accidental always-on wiring).
  const results = renderToStaticMarkup(
    createElement(QuoteHelpSurface, { mode: "results" }),
  );
  assert.equal(results.includes("data-booking-error-whatsapp-help"), false);
  assert.equal(results.includes("wa.me"), false);
});

check("Double-mounted confirm dialogs would duplicate ids — fixture mounts only one", () => {
  // Demonstrates why QuoteCard must mount a single StartNewQuoteControls instance.
  const bad = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(StartNewQuoteControls, {
        confirmOpen: true,
        onRequestStart: noop,
        onCancelConfirm: noop,
        onConfirmStart: noop,
        titleId: "start-new-quote-title",
        descId: "start-new-quote-desc",
      }),
      createElement(StartNewQuoteControls, {
        confirmOpen: true,
        onRequestStart: noop,
        onCancelConfirm: noop,
        onConfirmStart: noop,
        titleId: "start-new-quote-title",
        descId: "start-new-quote-desc",
      }),
    ),
  );
  assert.equal(countMatches(bad, /id="start-new-quote-title"/g), 2);

  const good = renderToStaticMarkup(
    createElement(QuoteHelpSurface, { mode: "error", confirmOpen: true }),
  );
  assert.equal(countMatches(good, /role="alertdialog"/g), 1);
  assert.equal(countMatches(good, /data-booking-error-whatsapp-help/g), 1);
  assert.equal(countMatches(good, /data-start-new-quote-controls/g), 0);
});

console.log("\nAll rendered quote error-help / Start New Quote checks passed.");
