/**
 * Customer-facing required-field copy for the public quote / booking form.
 * Keep these exact — QuoteCard and regression tests share this module.
 */

export const QUOTE_REQUIRED_FIELD_MESSAGES = {
  name: "Please enter your name",
  mobile: "Please enter your mobile number",
  mobileInvalid: "Please enter a valid mobile number",
  email: "Please enter your email address",
  emailInvalid: "Please enter a valid email address",
  pickup: "Please select a pickup address",
  destination: "Please select a destination",
  dateTime: "Please select a date and time",
  flightNumber: "Please enter your flight number",
  terms: "Please agree to the Terms & Conditions and Privacy Policy",
  passengers: "Please select the number of passengers",
  suitcases: "Please select the number of large suitcases",
} as const;

export type QuoteRequiredFieldMessage =
  (typeof QUOTE_REQUIRED_FIELD_MESSAGES)[keyof typeof QUOTE_REQUIRED_FIELD_MESSAGES];
