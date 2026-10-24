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
};

export default function TerminalAccessOptions(props: Props) {
  const { leg, airportCode, service, choice, onChange, freeAvailable, meetGreetIncluded,
    terminalFee, meetGreetFee } = props;
  const id = `${leg}-${airportCode}-${service}`;
  const meetGreet = choice === "meet-greet" || meetGreetIncluded;
  const pickup = service === "pick-up";
  const direction = pickup ? "Pickup" : "Drop-off";
  const name = airportCode === "BFS" ? "Belfast International" : "Belfast City";
  const walk = airportCode === "BFS" ? "4 minutes" : "5–10 minutes";
  const price = (fee: number) => `${fee > 0 ? "+" : ""}${formatMeetGreetGbp(fee)}`;
  const card = (selected: boolean) => `grid min-h-11 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-1 rounded-xl border px-3 py-2.5 text-sm text-white transition-colors focus-within:ring-2 focus-within:ring-emerald ${selected ? "border-emerald/50 bg-emerald/5" : "border-white/20 bg-white/[0.03]"}`;
  return <div className="min-w-0 space-y-2.5 text-left" data-terminal-access={id}>
    <header>
      {leg === "return" && <p className="mb-0.5 text-xs font-medium text-white/65">Return journey</p>}
      <h3 className="text-sm font-semibold leading-snug text-white">Airport {direction} — {name}</h3>
      <p className="mt-1 text-xs text-white/70">{pickup ? "Choose how you’d like to meet your driver." : "Choose where you’d like your driver to drop you off."}</p>
    </header>
    {pickup && <label className={card(meetGreet)}>
      <input type="checkbox" checked={meetGreet} disabled={meetGreetIncluded}
        onChange={(event) => onChange(event.target.checked ? "meet-greet" : freeAvailable ? "free" : "express")}
        className="mt-0.5 h-4 w-4 accent-emerald" />
      <span className="font-semibold">Meet &amp; Greet</span>
      <span className="whitespace-nowrap font-semibold text-emerald">{meetGreetIncluded ? "Included" : price(meetGreetFee)}</span>
      <span className="col-start-2 col-end-4 text-xs leading-relaxed text-white/70">Your driver meets you inside Arrivals with a name board and helps with your luggage. Parking and terminal access included.</span>
    </label>}
    <fieldset className="min-w-0 space-y-2" disabled={meetGreet}>
      <legend className="mb-1.5 text-sm font-semibold text-white">Choose Your {direction} Location</legend>
      {meetGreet ? <p className="rounded-xl border border-emerald/30 bg-emerald/5 px-3 py-2 text-xs leading-relaxed text-white/80" role="status">Terminal pickup and parking included with Meet &amp; Greet. No separate access charge.</p> : <>
        {freeAvailable && <label className={card(choice === "free")}>
          <input type="radio" name={id} value="free" checked={choice === "free"} onChange={() => onChange("free")}
            className="mt-0.5 h-4 w-4 accent-emerald" />
          <span className="font-semibold">Free {direction}</span>
          <span className="whitespace-nowrap font-semibold text-emerald">£0</span>
          <span className="col-start-2 col-end-4 text-xs leading-relaxed text-white/70">
            {pickup ? `A short walk from the terminal to the Long Stay collection point (approximately ${walk}). Follow the airport signs to meet your driver.` : `Your driver drops you at the Long Stay car park. Follow the airport signs to the terminal (approximately ${walk} on foot).`}
          </span>
        </label>}
        <label className={card(choice === "express")}>
          <input type="radio" name={id} value="express" checked={choice === "express"} onChange={() => onChange("express")}
            className="mt-0.5 h-4 w-4 accent-emerald" />
          <span className="font-semibold">Terminal {direction}</span>
          <span className="whitespace-nowrap font-semibold text-emerald">{price(terminalFee)}</span>
          <span className="col-start-2 col-end-4 text-xs leading-relaxed text-white/70">{pickup ? "Meet your driver at the designated paid pickup area, closer to the terminal." : "Your driver uses the designated paid drop-off area, closer to the terminal."}</span>
        </label>
        {choice === "free" && <p className="px-1 text-[11px] leading-snug text-white/60">{airportCode === "BFS" ? "Long Stay: 15-minute vehicle limit for free access." : "Long Stay: exit within 10 minutes for free access. Re-entry within 15 minutes is chargeable."}</p>}
      </>}
    </fieldset>
  </div>;
}
