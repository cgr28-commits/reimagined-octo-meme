"use client";

import { OWNER_NO_AVAILABILITY_MESSAGE } from "../../shared/booking-notice";

export function OwnerNoAvailabilityBlocked({
  message = OWNER_NO_AVAILABILITY_MESSAGE,
  onChooseAnotherDate,
  onChooseAnotherTime,
}: {
  message?: string;
  onChooseAnotherDate?: () => void;
  onChooseAnotherTime?: () => void;
}) {
  return (
    <div className="space-y-3" data-owner-no-availability-blocked>
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100" role="alert">
        {/* Only shown when the owner has marked this time unavailable (owner, 15 Nov 2026). */}
        <p className="font-bold" data-fully-booked-heading>Fully booked</p>
        <p className="mt-0.5">{message}</p>
      </div>
      {onChooseAnotherDate ? (
        <button type="button" onClick={onChooseAnotherDate} className="btn-secondary w-full">
          Choose another date
        </button>
      ) : null}
      {onChooseAnotherTime ? (
        <button type="button" onClick={onChooseAnotherTime} className="btn-secondary w-full">
          Choose another time
        </button>
      ) : null}
    </div>
  );
}
