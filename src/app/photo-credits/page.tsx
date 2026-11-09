import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { SITE } from "@/lib/data";

export const metadata: Metadata = {
  title: `Photo credits | ${SITE.name}`,
  description: `Credits and licences for photographs used on the ${SITE.name} website.`,
  alternates: { canonical: "/photo-credits/" },
};

type Credit = {
  subject: string;
  usedOn: string;
  title: string;
  author: string;
  source: string;
  licence: string;
  licenceUrl: string;
  changes: string;
};

/**
 * Photographs whose licences ask for a credit. Each entry names the work, author, source,
 * licence and the changes made, as the Creative Commons licences require.
 */
const CREDITS: Credit[] = [
  {
    subject: "Giant's Causeway",
    usedOn: "Landmark photographs on airport and transfer pages",
    title: "Giant's Causeway (14)",
    author: "Chmee2",
    source: "https://commons.wikimedia.org/wiki/File:Giant%27s_Causeway_(14).JPG",
    licence: "CC BY 3.0",
    licenceUrl: "https://creativecommons.org/licenses/by/3.0/",
    changes: "Cropped, resized and re-encoded.",
  },
  {
    subject: "Dublin Airport Terminal 2",
    usedOn: "Dublin Airport pages",
    title: "Dublin Airport Terminal 2 - 2024-05-18",
    author: "瑞丽江的河水 (Wikimedia Commons user)",
    source: "https://commons.wikimedia.org/wiki/File:Dublin_Airport_Terminal_2_-_2024-05-18.jpg",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes: "Cropped, resized and re-encoded. The adapted image is shared under the same licence.",
  },
  {
    subject: "Belfast Grand Central Station",
    usedOn: "Belfast Grand Central Station taxi page",
    title: "Grand Central Station, Belfast (Feb 25)",
    author: "RooneyDonal21",
    source: "https://commons.wikimedia.org/wiki/File:Grand_Central_Station,_Belfast_(Feb_25).jpg",
    licence: "CC0 1.0 (public domain dedication, credit given as a courtesy)",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    changes: "Resized and re-encoded.",
  },
];

export default function PhotoCreditsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-36 md:pt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-white/60 transition-colors hover:text-emerald">
            ← Home
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-white">Photo credits</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Some photographs on this website are used under Creative Commons licences. The photographers
            and licences are listed below. Other photographs are our own or used under licences that do not
            require a credit.
          </p>
          <ul className="mt-8 space-y-5">
            {CREDITS.map((credit) => (
              <li key={credit.source} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-relaxed text-white/75">
                <h2 className="text-base font-semibold text-white">{credit.subject}</h2>
                <p className="mt-1 text-white/55">{credit.usedOn}</p>
                <p className="mt-3">
                  “
                  <a href={credit.source} className="text-emerald underline underline-offset-4" rel="noopener noreferrer" target="_blank">
                    {credit.title}
                  </a>
                  ” by {credit.author}, licensed under{" "}
                  <a href={credit.licenceUrl} className="text-emerald underline underline-offset-4" rel="noopener noreferrer license" target="_blank">
                    {credit.licence}
                  </a>
                  . {credit.changes}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </>
  );
}
