import type { Metadata } from "next";
import ContactCardClient from "./ContactCardClient";
import { SITE } from "@/lib/data";
import { absoluteSiteUrl } from "@/lib/paths";

export const metadata: Metadata = {
  title: `Contact card | ${SITE.name}`,
  description: `Save ${SITE.name} to your phone — call, WhatsApp @${SITE.whatsappUsername}, email, or add to contacts.`,
  alternates: {
    canonical: "/contact/",
  },
  openGraph: {
    title: `${SITE.name} — Digital contact card`,
    description: `Call ${SITE.landlineDisplay} · WhatsApp @${SITE.whatsappUsername} · ${SITE.email}`,
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
