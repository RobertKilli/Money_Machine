import { describe, expect, it } from "vitest";
import { isValidSchedulerBearer } from "@/domain/notifications/scheduler-auth";

describe("notification scheduler authentication", () => {
  it("accepts only the configured bearer secret", () => {
    expect(isValidSchedulerBearer("Bearer scheduler-secret", "scheduler-secret")).toBe(true);
    expect(isValidSchedulerBearer("Bearer wrong", "scheduler-secret")).toBe(false);
    expect(isValidSchedulerBearer("Bearer scheduler-secret", undefined)).toBe(false);
    expect(isValidSchedulerBearer("Bearer scheduler-secret", "different-length")).toBe(false);
    expect(isValidSchedulerBearer("", "scheduler-secret")).toBe(false);
  });
});
