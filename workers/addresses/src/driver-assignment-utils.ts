import { authorizeDriverJobAction, jobVisibleToPortalDriver } from "../shared/driver-portal-access";
import type { TrackingJobRecord } from "../shared/tracking";
import type { DriverSession } from "./driver-auth";

export function filterJobsForSession(
  jobs: TrackingJobRecord[],
  session: DriverSession,
): TrackingJobRecord[] {
  if (!session.authorized || session.role === "owner") {
    return jobs;
  }

  if (!session.driverName && !session.profileKey) {
    return [];
  }

  return jobs.filter((job) =>
    jobVisibleToPortalDriver(job, {
      driverName: session.driverName,
      profileKey: session.profileKey,
    }),
  );
}

export function assertDriverCanOperateJob(
  record: TrackingJobRecord,
  session: DriverSession,
): string | null {
  return authorizeDriverJobAction(session, record, null, "operate");
}

export function assertDriverCanViewJob(
  record: TrackingJobRecord,
  session: DriverSession,
): string | null {
  return authorizeDriverJobAction(session, record, null, "view");
}
