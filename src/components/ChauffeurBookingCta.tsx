"use client";

import { SITE } from "@/lib/data";
import { useIsMobileDevice } from "@/lib/device";
import DeviceBookingCta from "./DeviceBookingCta";

const WHATSAPP_MESSAGE =
  "Hi, I'd like a quote for chauffeur / executive private hire. Please let me know availability and price.";

export default function ChauffeurBookingCta() {
  const isMobile = useIsMobileDevice();

  return (
    <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center sm:p-10">
      <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/70">
        {isMobile === true ? (
          <>
            Your professional driver, your schedule, door to door. Get a personalised quote via
            WhatsApp — hourly hire, point-to-point journeys, and executive airport transfers
            available.
          </>
        ) : (
          <>
            Your professional driver, your schedule, door to door. Submit a booking enquiry online
            or email{" "}
            <a
              href={`mailto:${SITE.email}`}
              className="font-semibold text-emerald transition-colors hover:text-emerald-light"
            >
              {SITE.email}
            </a>{" "}
            for hourly hire, point-to-point journeys, and executive airport transfers.
          </>
        )}
      </p>
      <div className="mt-6 flex justify-center">
        <DeviceBookingCta
          whatsappMessage={WHATSAPP_MESSAGE}
          mobileLabel="Request chauffeur quote"
          desktopLabel="Request chauffeur quote online"
          className="inline-flex items-center gap-2 rounded-full bg-emerald px-8 py-3.5 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25"
        />
      </div>
    </div>
  );
}
