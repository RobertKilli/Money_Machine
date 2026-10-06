"use server";

import { types } from "node:util";
import { notFound } from "next/navigation";
import { parseOfflineInputLabFormData, type OfflineInputLabFieldError } from "@/application/intelligence/offline-input-lab-contract";
import type { OfflineInputLabResult } from "@/application/intelligence/run-offline-review-input-lab";

export type OfflineInputLabActionResult = Readonly<
  | { status: "INVALID"; errors: readonly OfflineInputLabFieldError[]; result: null }
  | { status: "EVALUATED"; errors: readonly []; result: OfflineInputLabResult }
>;

/** FormData is parsed by the Next Server Action runtime before entry; application checks start at this exact gate. */
export async function evaluateOfflineInputLabAction(formData: FormData): Promise<OfflineInputLabActionResult> {
  if (process.env.NODE_ENV !== "development") notFound();
  if (!formData || typeof formData !== "object" || types.isProxy(formData) || Object.getPrototypeOf(formData) !== FormData.prototype || Reflect.ownKeys(formData).length !== 0) {
    return Object.freeze({ status: "INVALID", errors: Object.freeze([Object.freeze({ field: "form", code: "INPUT_INVALID" as const, message: "A native bounded form submission is required; no evaluation was run." })]), result: null });
  }

  const parsed = parseOfflineInputLabFormData(formData);
  if (parsed.status !== "VALID") return Object.freeze({ status: "INVALID", errors: parsed.errors, result: null });

  const { runOfflineReviewInputLab } = await import("@/application/intelligence/run-offline-review-input-lab");
  const result = await runOfflineReviewInputLab(parsed.input);
  if (result.status === "INVALID") return Object.freeze({ status: "INVALID", errors: result.errors, result: null });
  return Object.freeze({ status: "EVALUATED", errors: Object.freeze([]) as readonly [], result });
}
