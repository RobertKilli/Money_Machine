import { timingSafeEqual } from "node:crypto";

export function isValidSchedulerBearer(authorization: string | null, expectedSecret: string | undefined): boolean {
  if (!expectedSecret || !authorization?.startsWith("Bearer ")) return false;
  const presented = authorization.slice(7);
  const left = Buffer.from(presented, "utf8");
  const right = Buffer.from(expectedSecret, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
