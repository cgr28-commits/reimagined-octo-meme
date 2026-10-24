"use client";

import type { AirportAccessChoice } from "../../shared/meet-greet";
import { formatMeetGreetGbp } from "../../shared/meet-greet";

type Props = {
  leg: "outbound" | "return";
  airportCode: "BFS" | "BHD";
  service: "pick-up" | "drop-off";
  choice: AirportAccessChoice;
  onChange: (choice: AirportAccessChoice) => void;
  freeAvailable: boolean;
  meetGreetIncluded: boolean;
  terminalFee: number;
  meetGreetFee: number;
  charge: number;
};

export default function TerminalAccessOptions(props: Props) {
  const { leg, airportCode, service, choice, onChange, freeAvailable, meetGreetIncluded,
    terminalFee, meetGreetFee, charge } = props;
  const id = `${leg}-${airportCode}-${service}`;
  const meetGreet = choice === "meet-greet" || meetGreetIncluded;
  const pickup = service === "pick-up";
  const name = airportCode === "BFS" ? "Belfast International" : "Belfast City";
  return <div className="min-w-0 space-y-3 text-left" data-terminal-access={id}>
    <h3 className="text-sm font-semibold text-white">{leg === "return" ? "Return" : "Outbound"} · {name} {pickup ? "pickup" : "drop-off"}</h3>
    {pickup && <div>
      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-white/20 p-3 text-sm text-white">
        <input type="checkbox" checked={meetGreet} disabled={meetGreetIncluded}
          onChange={(event) => onChange(event.target.checked ? "meet-greet" : freeAvailable ? "free" : "express")}
          className="mt-1 h-4 w-4 shrink-0 accent-emerald" />
        <span><span className="block font-semibold">Meet &amp; Greet — {meetGreetIncluded ? "included" : formatMeetGreetGbp(meetGreetFee)}</span>
          <span className="mt-1 block text-xs text-white/75">Your driver meets you inside Arrivals with a name board and helps with luggage. Airport parking and terminal access included.</span>
        </span>
      </label>
    </div>}
    <fieldset className="min-w-0 space-y-2" disabled={meetGreet}>
      <legend className="mb-2 text-sm font-semibold text-white">Terminal Access</legend>
      {meetGreet ? <p className="text-sm text-white/80">Included with Meet &amp; Greet — no additional terminal access charge.</p> : <>
        {freeAvailable && <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/20 p-3 text-sm text-white focus-within:ring-2 focus-within:ring-emerald">
          <input type="radio" name={id} value="free" checked={choice === "free"} onChange={() => onChange("free")}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald" />
          <span><span className="block font-semibold">Free Airport Access — £0</span>
            <span className="mt-1 block text-xs text-white/75">
              {pickup ? "Meet your driver in" : "Your driver drops you at"} the Long Stay car park, away from the terminal doors.
              {airportCode === "BHD" ? " Follow the marked path; allow approximately 5–10 minutes to walk." : " Follow the airport signs between Long Stay and the terminal."}
              {airportCode === "BFS" ? " The airport allows 15 minutes free for pickup or drop-off." : " The airport allows 10 minutes free; re-entry within 15 minutes is chargeable."}
              {pickup ? " Contact your driver when you are ready at the collection point." : ""}
            </span>
          </span>
        </label>}
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/20 p-3 text-sm text-white focus-within:ring-2 focus-within:ring-emerald">
          <input type="radio" name={id} value="express" checked={choice === "express"} onChange={() => onChange("express")}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald" />
          <span><span className="block font-semibold">Terminal Access — {formatMeetGreetGbp(terminalFee)}</span>
            <span className="mt-1 block text-xs text-white/75">Your driver uses the paid terminal {pickup ? "pickup" : "drop-off"} area for a more convenient {pickup ? "collection" : "drop-off"}.</span>
          </span>
        </label>
      </>}
    </fieldset>
    <p className="text-xs text-white/75" aria-live="polite">{meetGreet ? "Meet & Greet, including access" : choice === "express" ? "Terminal Access" : "Free Airport Access"}: {formatMeetGreetGbp(charge)}</p>
  </div>;
}
