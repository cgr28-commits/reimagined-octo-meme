import { SITE } from "@/lib/data";

/** Published operator details for terms, privacy, invoices, and chargeback evidence. */
export const BUSINESS_LEGAL = {
  tradingName: SITE.name,
  email: SITE.email,
  website: SITE.url,
  jurisdiction: "Northern Ireland, United Kingdom",
  serviceArea: "Greater Belfast and across Northern Ireland",
  operatorNote: "Fully licensed and insured private hire operator",
  complaintsEmail: SITE.email,
  addressOnRequestNote:
    "Business address available on request — email bookings@myairporttaxini.co.uk for legal, corporate, or booking enquiries.",
} as const;
