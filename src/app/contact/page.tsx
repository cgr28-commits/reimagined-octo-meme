import type { Metadata } from "next";
import ContactCardClient from "./ContactCardClient";
import { SITE } from "@/lib/data";
import { absoluteSiteUrl } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Contact My Airport Taxi NI | Airport Transfers",
  description: `WhatsApp @${SITE.whatsappUsername}, email or save ${SITE.name} to your phone. Book airport transfers with flight monitoring and secure online booking.`,
  alternates: {
    canonical: "/contact/",
  },
  openGraph: {
    title: "Contact My Airport Taxi NI | Airport Transfers",
    description: `WhatsApp @${SITE.whatsappUsername}, email or save ${SITE.name} to your phone.`,
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
