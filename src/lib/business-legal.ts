import { SITE } from "@/lib/data";

/** Published operator details for terms, privacy, invoices, and chargeback evidence. */
export const BUSINESS_LEGAL = {
  tradingName: SITE.name,
  email: SITE.email,
  phoneDisplay: SITE.landlineDisplay,
  phoneTel: SITE.landline,
  website: SITE.url,
  jurisdiction: "Northern Ireland, United Kingdom",
  serviceArea: "Greater Belfast and across Northern Ireland",
  operatorNote: "Fully licensed and insured private hire operator",
  complaintsEmail: SITE.email,
} as const;
