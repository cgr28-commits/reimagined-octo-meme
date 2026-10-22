import type { DriverJob } from "@/lib/tracking-api";
import { googleMapsNavigateUrl } from "../../../shared/driver-portal-access";
import { buildAirportPickupInstruction } from "../../../shared/company-voice-journey";
import { MEET_GREET_DRIVER_NOTE } from "../../../shared/meet-greet";

/** Presentation only. The existing API remains responsible for driver access and privacy. */
export default function DriverJobSummary({ job, cancelled, journeyLabel }: {
  job: DriverJob;
  cancelled: boolean;
  journeyLabel: string;
}) {
  const pending = job.assignmentStatus === "pending";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(job.tripDate ?? "")
    ? new Date(`${job.tripDate}T12:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London",
      })
    : job.tripDate || "Date to be confirmed";
  const instruction = job.isAirportPickup
    ? job.airportAccessOption === "meet-greet"
      ? MEET_GREET_DRIVER_NOTE
      : buildAirportPickupInstruction(job)
    : null;
  const status = cancelled
    ? job.bookingStatus === "cancelled" ? "Booking cancelled" : "Refunded · Job cancelled"
    : pending ? "Awaiting acceptance" : journeyLabel;
  return <div className="min-w-0 space-y-3" data-driver-job-summary>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Pickup time</p>
        <p className="text-3xl font-bold tabular-nums leading-tight text-white" data-pickup-time>{job.tripTime || "Time to be confirmed"}</p>
        <p className="mt-1 text-sm text-white/75">{date}</p>
      </div>
      <span className={`max-w-full rounded-lg px-2.5 py-1.5 text-xs font-semibold ${cancelled ? "bg-red-500/15 text-red-200" : pending ? "bg-amber-500/15 text-amber-200" : "bg-emerald/10 text-emerald"}`}>
        {status}
      </span>
    </div>
    <div>
      <p className="break-words text-sm font-bold text-emerald">{job.bookingReference ? `Booking ${job.bookingReference}` : "Booking reference unavailable"}</p>
      <p className="text-xs text-white/60">{job.journeyLeg === "return" ? "Return journey" : job.journeyLeg === "outbound" ? "Outbound journey" : "Journey"}</p>
    </div>
    <h2 className="break-words text-lg font-semibold text-white">{job.customerName}</h2>
    <dl className="space-y-3 border-l-2 border-emerald/50 pl-3">
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-emerald">Pickup</dt><dd className="break-words font-semibold leading-snug text-white">{job.pickupLabel || "Pickup address unavailable"}</dd></div>
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-white/60">Destination</dt><dd className="break-words font-semibold leading-snug text-white">{job.dropoffLabel || "Destination address unavailable"}</dd></div>
    </dl>
    <div className="grid grid-cols-2 gap-2">
      {[['Navigate to pickup', job.pickupLabel], ['Navigate to destination', job.dropoffLabel]].map(([label, address]) => address ? <a key={label} href={googleMapsNavigateUrl(address)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-lg border border-white/20 px-2 py-2 text-center text-sm font-semibold text-white hover:bg-white/5">{label}</a> : null)}
    </div>
    <div className="space-y-1 text-sm text-white/80">
      {(job.passengers != null || job.suitcases != null) && <p>Passengers: {job.passengers ?? "—"} · Suitcases: {job.suitcases ?? "—"}</p>}
      {job.bookedVehicle && <p>Vehicle booked: {job.bookedVehicle}</p>}
      {job.childSeats && <p>Child seats: {job.childSeats}</p>}
    </div>
    {job.flightNumber && <p className="break-words text-lg font-bold text-emerald">Flight {job.flightNumber}{job.airportCode ? ` · ${job.airportCode}` : ""}</p>}
    {instruction && <div className="rounded-lg bg-white/5 p-3 text-sm text-white/80"><h3 className="font-semibold text-white">Airport pickup instructions</h3><p className="mt-1" data-driver-meet-greet={job.airportAccessOption === "meet-greet" || undefined}>{instruction}</p></div>}
    {job.notes && <div className="text-sm text-white/80"><h3 className="font-semibold text-white">Customer notes</h3><p className="whitespace-pre-line break-words">{job.notes}</p></div>}
    {pending && !cancelled && <p className="text-xs text-white/60">Customer telephone and WhatsApp are available after you accept.</p>}
  </div>;
}
