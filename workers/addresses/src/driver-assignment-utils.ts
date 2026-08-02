import {
  driverCanOperateJob,
  jobAssignmentStatus,
  jobVisibleToDriver,
  type TrackingJobRecord,
} from "../shared/tracking";
import { resolveDriverSession } from "./driver-auth";

export function filterJobsForSession(
  jobs: TrackingJobRecord[],
  session: ReturnType<typeof resolveDriverSession>,
): TrackingJobRecord[] {
  if (!session.authorized || session.role === "owner") {
    return jobs;
  }

  if (!session.driverName) {
    return [];
  }

  return jobs.filter((job) => jobVisibleToDriver(job, session.driverName!));
}

export function assertDriverCanOperateJob(
  record: TrackingJobRecord,
  session: ReturnType<typeof resolveDriverSession>,
): string | null {
  if (!session.authorized) {
    return "Unauthorized";
  }

  if (session.role === "owner") {
    return null;
  }

  if (!session.driverName) {
    return "Driver identity is not configured";
  }

  if (!driverCanOperateJob(record, session.driverName)) {
    const status = jobAssignmentStatus(record);
    if (status === "pending") {
      return "Accept this job on your dashboard before starting live tracking";
    }

    return "This job is not assigned to you";
  }

  return null;
}
