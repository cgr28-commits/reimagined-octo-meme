import type { Metadata } from "next";
import ContactCardClient from "./ContactCardClient";
import { SITE } from "@/lib/data";
import { absoluteSiteUrl } from "@/lib/paths";

export const metadata: Metadata = {
  title: `Contact card | ${SITE.name}`,
  description: `Book, call, WhatsApp @${SITE.whatsappUsername}, email, or save ${SITE.name} to your phone.`,
  alternates: {
    canonical: "/contact/",
  },
  openGraph: {
    title: `${SITE.name} — Digital contact card`,
    description: `Book online · Call ${SITE.landlineDisplay} · WhatsApp @${SITE.whatsappUsername}`,
    url: absoluteSiteUrl("/contact/"),
    images: [
      {
        url: absoluteSiteUrl("/og-image-square.png"),
        width: 1200,
        height: 1200,
        alt: `${SITE.name} contact card`,
      },
    ],
  },
};

export default function ContactPage() {
  return <ContactCardClient />;
}
