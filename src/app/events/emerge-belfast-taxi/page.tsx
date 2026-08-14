import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import EmergeBelfastPageClient from "@/components/EmergeBelfastPageClient";
import {
  EMERGE_BELFAST_META,
  EMERGE_BELFAST_PATH,
  getEmergeServiceJsonLd,
} from "@/lib/emerge-belfast";
import { absoluteSiteUrl, withBasePath } from "@/lib/paths";
import { getBreadcrumbJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: EMERGE_BELFAST_META.title,
  description: EMERGE_BELFAST_META.description,
  alternates: { canonical: EMERGE_BELFAST_META.canonicalPath },
  openGraph: {
    title: EMERGE_BELFAST_META.ogTitle,
    description: EMERGE_BELFAST_META.ogDescription,
    url: EMERGE_BELFAST_META.canonicalPath,
    type: "website",
    images: [
      {
        url: withBasePath("/og-image-square.png"),
        width: 1200,
        height: 1200,
        alt: "My Airport Taxi NI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: EMERGE_BELFAST_META.ogTitle,
    description: EMERGE_BELFAST_META.ogDescription,
    images: [absoluteSiteUrl("/og-image-square.png")],
  },
};

export default function EmergeBelfastTaxiPage() {
  const breadcrumb = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "EMERGE Belfast taxi transfers", path: EMERGE_BELFAST_PATH },
  ]);
  const serviceLd = getEmergeServiceJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }}
      />
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-10">
        <EmergeBelfastPageClient />
      </main>
      <Footer />
    </>
  );
}
