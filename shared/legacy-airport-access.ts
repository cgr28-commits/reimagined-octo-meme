/** v2 access policy from main 2c6bfb59. Only for pre-optional-access clients. */
import {listAirportPickupLegs, mandatoryTerminalFeeGbp, type ExpressLegChargeSnapshot, type MeetGreetFeesGbp, type QuotedAirportAccess, type QuotedAirportAccessLeg, type AirportAccessChoice} from "./meet-greet";
const roundGbp = (value: number) => Math.round(value * 100) / 100;
const expressAirportCode = (code: string | null | undefined): "BFS" | "BHD" | null => { const v=String(code ?? "").trim().toUpperCase(); return v === "BFS" || v === "BHD" ? v : null; };
export function quoteLegacyAirportAccessCharges(input: {
  expressLegs?: ExpressLegChargeSnapshot[] | null;
  airportCode?: string | null;
  fromAirport?: boolean | null;
  returnJourney?: boolean | null;
  isAirportToAirport?: boolean | null;
  pickupAirportCode?: string | null;
  dropoffAirportCode?: string | null;
  outboundChoice?: AirportAccessChoice | null;
  returnChoice?: AirportAccessChoice | null;
  fees?: MeetGreetFeesGbp | null;
  /** Executive airport pickup: Meet & Greet is part of the fare, not an extra charge. */
  meetGreetIncluded?: boolean;
}): QuotedAirportAccess {
  // Customer free / Meet & Greet choices are ignored. The configured terminal fee applies.
  const expressLegs = input.expressLegs ?? [];
  const pickupLegs = listAirportPickupLegs(input);
  const legs: QuotedAirportAccessLeg[] = [];

  for (const expressLeg of expressLegs) {
    const pickup =
      expressLeg.service === "pick-up" &&
      pickupLegs.some((leg) => leg.leg === expressLeg.leg);
    if (input.isAirportToAirport) {
      // Both airport ends are already in the fixed fare. Do not add Express again.
      legs.push({
        leg: expressLeg.leg,
        service: expressLeg.service,
        airportCode: expressLeg.airportCode,
        option: pickup && input.meetGreetIncluded ? "meet-greet" : "express",
        expressFeeGbp: 0,
        meetGreetFeeGbp: 0,
        chargeGbp: 0,
      });
      continue;
    }
    const terminalFee = mandatoryTerminalFeeGbp(expressLeg);
    legs.push({
      leg: expressLeg.leg,
      service: expressLeg.service,
      airportCode: expressLeg.airportCode,
      option:
        pickup && input.meetGreetIncluded && terminalFee <= 0
          ? "meet-greet"
          : terminalFee > 0
            ? "express"
            : "free",
      expressFeeGbp: terminalFee,
      meetGreetFeeGbp: 0,
      chargeGbp: terminalFee,
    });
  }

  for (const pickup of pickupLegs) {
    if (legs.some((leg) => leg.leg === pickup.leg && leg.service === "pick-up")) continue;
    // Dublin parking and toll stay in fixed costs. Meet & Greet is not sold on top.
    legs.push({
      leg: pickup.leg,
      service: "pick-up",
      airportCode: pickup.airportCode,
      option: input.meetGreetIncluded ? "meet-greet" : "free",
      expressFeeGbp: 0,
      meetGreetFeeGbp: 0,
      chargeGbp: 0,
    });
  }

  const chargeFor = (legName: "outbound" | "return") =>
    roundGbp(
      legs
        .filter((leg) => leg.leg === legName)
        .reduce((sum, leg) => sum + leg.chargeGbp, 0),
    );
  const optionFor = (legName: "outbound" | "return"): AirportAccessChoice | null => {
    const rows = legs.filter((leg) => leg.leg === legName);
    if (rows.length === 0) return null;
    if (rows.some((row) => row.option === "meet-greet")) return "meet-greet";
    if (rows.some((row) => row.option === "express")) return "express";
    return rows[0]!.option;
  };
  const outbound = legs.find((leg) => leg.leg === "outbound") ?? null;
  const ret = legs.find((leg) => leg.leg === "return") ?? null;
  const outboundAirportAccessChargeGbp = chargeFor("outbound");
  const returnAirportAccessChargeGbp = chargeFor("return");
  const expressDropOffFee = roundGbp(
    legs.reduce((sum, leg) => sum + leg.expressFeeGbp, 0),
  );
  const meetGreetTotalGbp = roundGbp(
    legs.reduce((sum, leg) => sum + leg.meetGreetFeeGbp, 0),
  );
  const expressAirport =
    expressAirportCode(outbound?.airportCode) ??
    expressAirportCode(ret?.airportCode) ??
    expressAirportCode(input.airportCode);
  const pickupOption =
    (input.fromAirport === true ? outbound?.option : null) ??
    (input.returnJourney && input.fromAirport !== true ? ret?.option : null) ??
    legs.find((leg) => leg.option === "meet-greet")?.option ??
    outbound?.option ??
    ret?.option ??
    null;

  return {
    legs,
    airportAccessChargeGbp: roundGbp(
      outboundAirportAccessChargeGbp + returnAirportAccessChargeGbp,
    ),
    outboundAirportAccessChargeGbp,
    returnAirportAccessChargeGbp,
    outboundAirportAccessOption: optionFor("outbound"),
    returnAirportAccessOption: optionFor("return"),
    expressDropOffSelected: legs.some((leg) => leg.option === "express"),
    expressDropOffFee,
    expressDropOffAirport: expressAirport,
    outboundExpressDropOffSelected: outbound?.option === "express",
    returnExpressDropOffSelected: ret?.option === "express",
    meetGreetFeeGbp: meetGreetTotalGbp,
    airportAccessOption:
      input.meetGreetIncluded && pickupLegs.length > 0 ? "meet-greet" : pickupOption,
  };
}

