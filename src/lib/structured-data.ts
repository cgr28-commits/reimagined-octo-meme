import { FAQS, SITE } from "./data";
import { TOURS } from "./tours";

const DESCRIPTION =
  "Professional airport taxi transfers across Northern Ireland. Flight tracking, meet & greet, and transfers from Belfast International, Dublin, and more.";

export function getWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    description: DESCRIPTION,
    inLanguage: "en-GB",
  };
}

export function getTourItemListJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Northern Ireland Private Day Trips",
    itemListElement: TOURS.map((tour, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: tour.title,
      url: `${SITE.url}/tours/${tour.slug}/`,
    })),
  };
}

export function getBreadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE.url}${item.path}`,
    })),
  };
}

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
