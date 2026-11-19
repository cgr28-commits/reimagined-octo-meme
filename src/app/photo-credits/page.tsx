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
    subject: "Belfast International Airport terminal",
    usedOn: "Belfast International Airport page (phones and tablets)",
    title: "BFS airport terminal (Image copyright Andrew McCarron)",
    author: "Andrew McCarron",
    source: "https://commons.wikimedia.org/wiki/File:BFS_airport_terminal_(Image_copyright_Andrew_McCarron).jpg",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes: "Cropped, resized, colour-graded and re-encoded. The adapted image is shared under the same licence.",
  },
  {
    subject: "Belfast City Airport entrance",
    usedOn: "Belfast City Airport page (phones and tablets)",
    title: "Entrance to George Best Belfast City Airport",
    author: "David Smith (Geograph Britain and Ireland)",
    source:
      "https://commons.wikimedia.org/wiki/File:Entrance_to_George_Best_Belfast_City_Airport_-_geograph.org.uk_-_3145806.jpg",
    licence: "CC BY-SA 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    changes: "Cropped, resized, colour-graded and re-encoded. The adapted image is shared under the same licence.",
  },
  {
    subject: "Dublin Airport at sunset",
    usedOn: "Dublin Airport page (phones)",
    title: "Airport in Dublin",
    author: "Skullical (Wikimedia Commons user)",
    source: "https://commons.wikimedia.org/wiki/File:Airport_in_Dublin.jpg",
    licence: "CC0 1.0 (public domain dedication, credit given as a courtesy)",
    licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    changes: "Cropped, resized, colour-graded and re-encoded.",
  },
  {
    subject: "City of Derry Airport terminal",
    usedOn: "City of Derry Airport page (phones and tablets)",
    title: "CODA",
    author: "Ddoherty958 (Wikimedia Commons user)",
    source: "https://commons.wikimedia.org/wiki/File:CODA.jpg",
    licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    changes: "Cropped, resized, colour-graded and re-encoded. The adapted image is shared under the same licence.",
  },
  {
    subject: "City of Derry Airport",
    usedOn: "City of Derry Airport pages (laptops) and Derry Airport routes",
    title: "City of Derry Airport 01",
    author: "Blue Magenta",
    source: "https://commons.wikimedia.org/wiki/File:City_of_Derry_Airport_01.JPG",
    licence: "CC BY-SA 3.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    changes: "Cropped, resized and re-encoded. The adapted image is shared under the same licence.",
  },
  {
    subject: "Titanic Belfast",
    usedOn: "Belfast landing pages and the Business Class page",
    title: "Building of Titanic Belfast - Belfast - Northern Ireland - UK (43588878982)",
    author: "Juan Antonio Segal",
    source:
      "https://commons.wikimedia.org/wiki/File:Building_of_Titanic_Belfast_-_Belfast_-_Northern_Ireland_-_UK_(43588878982).jpg",
    licence: "CC BY 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by/2.0/",
    changes: "Cropped, resized, colour-graded and re-encoded.",
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
