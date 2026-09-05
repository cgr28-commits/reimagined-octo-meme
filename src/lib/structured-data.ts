import { FAQS, SITE, SITE_PUBLIC_SEO_DESCRIPTION } from "./data";
import { TOURS } from "./tours";

const DESCRIPTION = SITE_PUBLIC_SEO_DESCRIPTION;

export function getWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    description: DESCRIPTION,
    inLanguage: "en-GB",
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      logo: `${SITE.url}/logo.png`,
    },
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
    "@type": ["TaxiService", "LocalBusiness"],
    "@id": `${SITE.url}/#business`,
    name: SITE.name,
    description: DESCRIPTION,
    url: SITE.url,
    logo: `${SITE.url}/logo.png`,
    image: `${SITE.url}/og-image-square.png`,
    email: SITE.email,
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Northern Ireland",
    },
    serviceType: "Airport Transfer",
    priceRange: "££",
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      opens: "00:00",
      closes: "23:59",
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: SITE.email,
      contactType: "customer service",
      availableLanguage: "English",
      areaServed: "GB-NIR",
      hoursAvailable: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "00:00",
        closes: "23:59",
      },
    },
  };
}

/** Airport / route landing pages — TaxiService + LocalBusiness with specific areaServed. */
export function getServiceAreaJsonLd(opts: {
  name: string;
  description: string;
  path: string;
  areaServed: string[];
}) {
  const openingHours = {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    opens: "00:00",
    closes: "23:59",
  };

  return {
    "@context": "https://schema.org",
    "@type": ["TaxiService", "LocalBusiness"],
    name: opts.name,
    description: opts.description,
    url: `${SITE.url}${opts.path}`,
    provider: {
      "@id": `${SITE.url}/#business`,
    },
    email: SITE.email,
    priceRange: "££",
    serviceType: "Airport Transfer",
    openingHoursSpecification: openingHours,
    areaServed: opts.areaServed.map((name) => ({
      "@type": "Place",
      name,
    })),
    contactPoint: {
      "@type": "ContactPoint",
      email: SITE.email,
      contactType: "customer service",
      availableLanguage: "English",
      areaServed: "GB-NIR",
      hoursAvailable: openingHours,
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
