export type AuthCallbackDiagnosticEvent =
  | "AUTH_CALLBACK_MISSING_CODE"
  | "AUTH_CALLBACK_WRONG_ORIGIN"
  | "AUTH_CALLBACK_PKCE_VERIFIER_MISSING"
  | "AUTH_CALLBACK_EXCHANGE_REJECTED"
  | "AUTH_CALLBACK_EXCHANGE_SUCCEEDED";

const documentedExchangeErrorCodes = new Set([
  "bad_code_verifier",
  "bad_oauth_callback",
  "bad_oauth_state",
  "flow_state_expired",
  "flow_state_not_found",
  "provider_email_needs_verification",
  "unexpected_failure",
  "validation_failed",
]);

export function safeSupabaseAuthErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "SUPABASE_AUTH_ERROR_UNKNOWN";
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && documentedExchangeErrorCodes.has(code)
    ? code
    : "SUPABASE_AUTH_ERROR_UNKNOWN";
}

export function logAuthCallbackDiagnostic(
  event: AuthCallbackDiagnosticEvent,
  error?: unknown,
): void {
  if (event === "AUTH_CALLBACK_EXCHANGE_REJECTED") {
    console.info("AUTH_CALLBACK_DIAGNOSTIC", {
      event,
      supabaseErrorCode: safeSupabaseAuthErrorCode(error),
    });
    return;
  }

  console.info("AUTH_CALLBACK_DIAGNOSTIC", { event });
}
