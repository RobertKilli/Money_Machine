export type LoginNotice = { kind: "success" | "error"; message: string } | null;

const errorMessages: Record<string, string> = {
  "invalid-email": "Enter a valid email address and try again.",
  "auth-not-configured": "Sign-in is temporarily unavailable. Please try again later.",
  "sign-in-unavailable": "We could not send a sign-in link. Check the address and try again.",
  "oauth-callback": "We could not complete sign-in. The link may have expired; request a new one.",
};

export function getLoginNotice(params: { error?: string | string[]; sent?: string | string[] }): LoginNotice {
  if (params.sent === "1") {
    return {
      kind: "success",
      message: "If this address can sign in, a link has been sent. Check your inbox.",
    };
  }

  if (typeof params.error !== "string") return null;
  return {
    kind: "error",
    message: errorMessages[params.error] ?? "Sign-in did not complete. Please try again.",
  };
}
