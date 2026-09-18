import { QueryWindowError } from './errors';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_HISTORY_POINTS = 2000;

export function assertHistoryQueryWindow(from: Date, to: Date, bucketSeconds = 60) {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
    throw new QueryWindowError('History range must have a positive duration.');
  }
  if (to.getTime() - from.getTime() > THIRTY_DAYS_MS) {
    throw new QueryWindowError();
  }
  const resolvedBucket = Math.max(bucketSeconds, 10);
  const spanSeconds = Math.ceil((to.getTime() - from.getTime()) / 1000);
  const estimated = Math.ceil(spanSeconds / resolvedBucket);
  if (estimated > MAX_HISTORY_POINTS) {
    throw new QueryWindowError();
  }
  return { bucketSeconds: resolvedBucket, estimated };
}
