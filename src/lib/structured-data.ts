import { FAQS, SITE } from "./data";

const DESCRIPTION =
  "Professional airport taxi transfers across Northern Ireland. Flight tracking, meet & greet, and transfers from Belfast International, Dublin, and more.";

export function getLocalBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "TaxiService",
    "@id": `${SITE.url}/#business`,
    name: SITE.name,
    description: DESCRIPTION,
    url: SITE.url,
    email: SITE.email,
    telephone: `+${SITE.whatsapp}`,
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Northern Ireland",
    },
    serviceType: "Airport Transfer",
    priceRange: "££",
    contactPoint: {
      "@type": "ContactPoint",
      telephone: `+${SITE.whatsapp}`,
      email: SITE.email,
      contactType: "customer service",
      availableLanguage: "English",
    },
  };
}

export function getFaqPageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
