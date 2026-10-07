export const LIFECYCLE_EVENT_TYPES = Object.freeze(["STARTED", "SOURCE_OBSERVED", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] as const);
export type LifecycleEventType = typeof LIFECYCLE_EVENT_TYPES[number];

export const LIFECYCLE_STATUSES = Object.freeze(["NOT_STARTED", "OPEN", ...LIFECYCLE_EVENT_TYPES] as const);
export type LifecycleStatus = typeof LIFECYCLE_STATUSES[number];

export function isLifecycleStatus(value: unknown): value is LifecycleStatus {
  return typeof value === "string" && (LIFECYCLE_STATUSES as readonly string[]).includes(value);
}
