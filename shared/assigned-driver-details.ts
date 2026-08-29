/**
 * Resolve which driver/vehicle details to use for customer notifications.
 * Priority: assigned snapshot on tracking job → booking-job snapshot → owner profile only if owner is the active driver.
 */

import { driverDisplayFirstName } from "./booking-job";
import { formatPartialRegistration } from "./partial-registration";

export type AssignedDriverSnapshot = {
  driverName?: string | null;
  driverMobile?: string | null;
  carMake?: string | null;
  carModel?: string | null;
  carColour?: string | null;
  registration?: string | null;
};

export type ResolvedAssignedDriverDetails = {
  driverFirstName: string;
  driverMobile: string;
  carMake: string;
  carModel: string;
  carColour: string;
  registrationFull: string;
  registrationPartial: string;
};

export function resolveAssignedDriverDetails(options: {
  tracking?: AssignedDriverSnapshot | null;
  booking?: AssignedDriverSnapshot | null;
  ownerFallback?: AssignedDriverSnapshot | null;
  /** When true, ownerFallback may be used (owner is the active driver). */
  ownerIsActiveDriver?: boolean;
}): ResolvedAssignedDriverDetails {
  const pick = (...sources: Array<AssignedDriverSnapshot | null | undefined>) => {
    const merged: AssignedDriverSnapshot = {};
    for (const source of sources) {
      if (!source) continue;
      if (!merged.driverName && source.driverName?.trim()) merged.driverName = source.driverName;
      if (!merged.driverMobile && source.driverMobile?.trim()) merged.driverMobile = source.driverMobile;
      if (!merged.carMake && source.carMake?.trim()) merged.carMake = source.carMake;
      if (!merged.carModel && source.carModel?.trim()) merged.carModel = source.carModel;
      if (!merged.carColour && source.carColour?.trim()) merged.carColour = source.carColour;
      if (!merged.registration && source.registration?.trim()) merged.registration = source.registration;
    }
    return merged;
  };

  const sources: Array<AssignedDriverSnapshot | null | undefined> = [
    options.tracking,
    options.booking,
  ];
  if (options.ownerIsActiveDriver) {
    sources.push(options.ownerFallback);
  }

  const resolved = pick(...sources);
  const registrationFull = resolved.registration?.trim().toUpperCase() || "";

  return {
    driverFirstName: driverDisplayFirstName(resolved.driverName),
    driverMobile: resolved.driverMobile?.trim() || "",
    carMake: resolved.carMake?.trim() || "",
    carModel: resolved.carModel?.trim() || "",
    carColour: resolved.carColour?.trim() || "",
    registrationFull,
    registrationPartial: formatPartialRegistration(registrationFull),
  };
}
