import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/data";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: `${SITE.name} | Premium Airport Transfers Northern Ireland`,
  description:
    "Professional airport taxi transfers across Northern Ireland. Flight tracking, meet & greet, and transfers from Belfast International, Dublin, and more. Book via WhatsApp.",
  keywords: [
    "airport taxi",
    "Belfast airport transfer",
    "Northern Ireland taxi",
    "Dublin airport taxi",
    "airport shuttle NI",
  ],
  openGraph: {
    title: SITE.name,
    description: SITE.tagline,
    type: "website",
    locale: "en_GB",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
