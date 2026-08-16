/**
 * Guards against the iOS mobile horizontal-shift bug on quote inputs.
 * Flight / contact fields must stay ≥16px so Safari does not zoom on focus.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
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

const css = read("src/app/globals.css");
const flight = read("src/components/FlightNumberField.tsx");
const progressive = read("src/components/QuoteProgressiveRoute.tsx");
const card = read("src/components/QuoteCard.tsx");

check("globals define quote-text-input at 16px", () => {
  assert.match(css, /\.quote-text-input\s*\{[\s\S]*font-size:\s*16px/);
  assert.match(css, /\.quote-helper-text\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
});

check("FlightNumberField uses quote-text-input and inset focus ring", () => {
  assert.match(flight, /quote-text-input/);
  assert.match(flight, /focus:ring-inset/);
  assert.match(flight, /quote-helper-text/);
  const inputClass = flight.match(/<input[\s\S]*?className="([^"]+)"/);
  assert.ok(inputClass?.[1], "input className present");
  assert.match(inputClass[1], /quote-text-input/);
  assert.doesNotMatch(inputClass[1], /text-sm/);
});

check("Progressive flight number field avoids text-sm zoom trap", () => {
  assert.match(progressive, /id="progressive-flight-number"/);
  const inputMatch = progressive.match(
    /id="progressive-flight-number"[\s\S]*?className="([^"]+)"/,
  );
  assert.ok(inputMatch?.[1], "progressive flight input class present");
  assert.match(inputMatch[1], /quote-text-input/);
  assert.match(inputMatch[1], /focus:ring-inset/);
  assert.doesNotMatch(inputMatch[1], /text-sm/);
});

check("Booking contact inputs use quote-text-input (16px)", () => {
  assert.match(card, /BOOKING_INPUT_CLASS[\s\S]*quote-text-input/);
});

console.log("\nAll flight-number overflow guards passed.");
