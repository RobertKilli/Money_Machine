import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => { throw new Error(`REDIRECT:${destination}`); }),
  getSupabaseServerClient: vi.fn(),
  signInWithOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  cookieStore: { getAll: vi.fn(() => [{ name: "sb-flsfallpputejojncyue-auth-token-code-verifier", value: "test-verifier" }]) },
  incomingHost: "moneymachine-eta.vercel.app",
  forwardedHost: "moneymachine-eta.vercel.app",
  forwardedProto: "https",
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({
    host: mocks.incomingHost,
    "x-forwarded-host": mocks.forwardedHost,
    "x-forwarded-proto": mocks.forwardedProto,
  }),
  cookies: async () => mocks.cookieStore,
}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.getSupabaseServerClient }));

import { getAuthApplicationOrigin, getAuthCallbackUrl, safePostAuthPath } from "@/lib/auth/callback-url";
import { GET } from "@/app/auth/callback/route";
import { safeSupabaseAuthErrorCode } from "@/lib/auth/callback-diagnostics";
import { hasExpectedPkceVerifierCookie } from "@/lib/auth/pkce-verifier-cookie";
import { requestMagicLink } from "@/app/login/actions";
import { getLoginNotice } from "@/app/login/notices";
import LoginPage from "@/app/login/page";
import { renderToStaticMarkup } from "react-dom/server";

describe("login callback configuration and flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://moneymachine-eta.vercel.app";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "moneymachine-eta.vercel.app";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://flsfallpputejojncyue.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
    mocks.incomingHost = "moneymachine-eta.vercel.app";
    mocks.forwardedHost = "moneymachine-eta.vercel.app";
    mocks.forwardedProto = "https";
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.cookieStore.getAll.mockReturnValue([
      { name: "sb-flsfallpputejojncyue-auth-token-code-verifier", value: "test-verifier" },
    ]);
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getSupabaseServerClient.mockResolvedValue({ auth: {
      signInWithOtp: mocks.signInWithOtp,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    } });
  });

  it("uses a validated origin for production, preview, and local callbacks", () => {
    expect(getAuthCallbackUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "moneymachine-eta.vercel.app" }))
      .toBe("https://moneymachine-eta.vercel.app/auth/callback");
    expect(getAuthCallbackUrl({ VERCEL_ENV: "preview", VERCEL_URL: "money-machine-git-auth.vercel.app" }))
      .toBe("https://money-machine-git-auth.vercel.app/auth/callback");
    expect(getAuthApplicationOrigin({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(getAuthApplicationOrigin({ NODE_ENV: "production", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "https://user:pass@evil.example/path" }))
      .toBeNull();
    expect(getAuthApplicationOrigin({ NODE_ENV: "production" })).toBeNull();
  });

  it("passes the explicit callback to Supabase and returns a generic sent status", async () => {
    const form = new FormData();
    form.set("email", "account@example.test");

    await expect(requestMagicLink(form)).rejects.toThrow("REDIRECT:/login?sent=1");
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "account@example.test",
      options: { emailRedirectTo: "https://moneymachine-eta.vercel.app/auth/callback" },
    });
    expect(getLoginNotice({ sent: "1" })?.message).toMatch(/If this address can sign in/);
    expect(getLoginNotice({ sent: "1" })?.message).not.toContain("account@example.test");
  });

  it("does not contact Supabase when the callback origin is invalid", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "javascript:alert(1)";
    const form = new FormData();
    form.set("email", "account@example.test");
    await expect(requestMagicLink(form)).rejects.toThrow("REDIRECT:/login?error=auth-not-configured");
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("keeps provider failures generic", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: new Error("account@example.test already exists") });
    const form = new FormData();
    form.set("email", "account@example.test");
    await expect(requestMagicLink(form)).rejects.toThrow("REDIRECT:/login?error=sign-in-unavailable");
  });

  it("maps known and unknown errors to fixed, non-reflective messages", () => {
    expect(getLoginNotice({ error: "invalid-email" })?.message).toMatch(/valid email address/);
    expect(getLoginNotice({ error: "sign-in-unavailable" })?.message).toMatch(/could not send a sign-in link/);
    expect(getLoginNotice({ error: "internal-secret-or-email@example.test" })?.message)
      .toBe("Sign-in did not complete. Please try again.");
    expect(getLoginNotice({ error: "internal-secret-or-email@example.test" })?.message)
      .not.toContain("internal-secret-or-email@example.test");
  });

  it("renders sent and error query states on the login page", async () => {
    const sent = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ sent: "1" }) }));
    const error = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error: "oauth-callback" }) }));
    expect(sent).toContain("If this address can sign in, a link has been sent.");
    expect(sent).toContain('role="status"');
    expect(error).toContain("We could not complete sign-in.");
    expect(error).toContain('role="alert"');
  });

  it.each(["__proto__", "constructor", "toString", "unrecognized-error-code"])(
    "renders prototype-like or unknown error code %s as a safe message",
    async (error) => {
      const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error }) }));
      expect(markup).toContain("Sign-in did not complete. Please try again.");
      expect(markup).not.toContain("[object Object]");
      expect(markup).not.toContain("function Object");
    },
  );

  it("exchanges a PKCE code and redirects on the configured app origin", async () => {
    const response = await GET(new Request("https://moneymachine-eta.vercel.app/auth/callback?code=opaque-code&next=%2Fdashboard%3Ftab%3Dpaper"));

    expect(mocks.cookieStore.getAll).toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("opaque-code");
    expect(response.headers.get("location")).toBe("https://moneymachine-eta.vercel.app/dashboard?tab=paper");
  });

  it("uses the preview deployment origin for both the callback and dashboard redirect", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "money-machine-git-auth-123.vercel.app";
    mocks.incomingHost = "money-machine-git-auth-123.vercel.app";
    mocks.forwardedHost = "money-machine-git-auth-123.vercel.app";
    const response = await GET(new Request("https://money-machine-git-auth-123.vercel.app/auth/callback?code=opaque-code"));
    expect(response.headers.get("location")).toBe("https://money-machine-git-auth-123.vercel.app/dashboard");
    expect(getAuthCallbackUrl()).toBe("https://money-machine-git-auth-123.vercel.app/auth/callback");
  });

  it("starts the OTP flow on the canonical Preview origin", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "money-machine-git-auth-123.vercel.app";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "moneymachine-eta.vercel.app";
    mocks.incomingHost = "money-machine-git-auth-123.vercel.app";
    mocks.forwardedHost = "money-machine-git-auth-123.vercel.app";
    const form = new FormData();
    form.set("email", "account@example.test");

    await expect(requestMagicLink(form)).rejects.toThrow("REDIRECT:/login?sent=1");
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "account@example.test",
      options: { emailRedirectTo: "https://money-machine-git-auth-123.vercel.app/auth/callback" },
    });
  });

  it("canonicalizes an alternate login alias before rendering the sign-in flow", async () => {
    mocks.incomingHost = "money-machine-alias.vercel.app";
    mocks.forwardedHost = "money-machine-alias.vercel.app";
    await expect(LoginPage({ searchParams: Promise.resolve({ sent: "1" }) }))
      .rejects.toThrow("REDIRECT:https://moneymachine-eta.vercel.app/login?sent=1");
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("does not start OTP on an alternate request host", async () => {
    mocks.incomingHost = "money-machine-alias.vercel.app";
    mocks.forwardedHost = "money-machine-alias.vercel.app";
    const form = new FormData();
    form.set("email", "account@example.test");
    await expect(requestMagicLink(form)).rejects.toThrow(
      "REDIRECT:https://moneymachine-eta.vercel.app/login?error=auth-not-configured",
    );
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("rejects external post-auth destinations and does not fall back to request Host", async () => {
    const response = await GET(new Request("https://moneymachine-eta.vercel.app/auth/callback?code=opaque-code&next=%2F%2Fevil.example"));
    expect(response.headers.get("location")).toBe("https://moneymachine-eta.vercel.app/dashboard");
    expect(safePostAuthPath("/\\evil.example")).toBe("/dashboard");
  });

  it("rejects callback on an alternate alias before exchanging the PKCE code", async () => {
    const response = await GET(new Request("https://money-machine-alias.vercel.app/auth/callback?code=opaque-code"));
    expect(response.status).toBe(400);
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("shows a safe callback error when code exchange fails", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("provider detail / account@example.test") });
    const response = await GET(new Request("https://moneymachine-eta.vercel.app/auth/callback?code=opaque-code"));
    expect(response.headers.get("location")).toBe("https://moneymachine-eta.vercel.app/login?error=oauth-callback");
  });

  it("checks only the expected Supabase PKCE verifier cookie names", () => {
    const projectUrl = "https://flsfallpputejojncyue.supabase.co";
    expect(hasExpectedPkceVerifierCookie([
      { name: "sb-flsfallpputejojncyue-auth-token-code-verifier", value: "synthetic-verifier" },
    ], projectUrl)).toBe(true);
    expect(hasExpectedPkceVerifierCookie([
      { name: "sb-flsfallpputejojncyue-auth-token-flow-flow_12345678-code-verifier.0", value: "chunk" },
    ], projectUrl)).toBe(true);
    expect(hasExpectedPkceVerifierCookie([
      { name: "sb-otherproject-auth-token-code-verifier", value: "synthetic-verifier" },
    ], projectUrl)).toBe(false);
    expect(hasExpectedPkceVerifierCookie([
      { name: "sb-flsfallpputejojncyue-auth-token-code-verifier", value: "" },
    ], projectUrl)).toBe(false);
  });

  it("does not exchange a callback code when its PKCE verifier cookie is missing", async () => {
    mocks.cookieStore.getAll.mockReturnValue([]);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await GET(new Request("https://moneymachine-eta.vercel.app/auth/callback?code=opaque-code"));

    expect(response.headers.get("location")).toBe("https://moneymachine-eta.vercel.app/login?error=oauth-callback");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("AUTH_CALLBACK_DIAGNOSTIC", { event: "AUTH_CALLBACK_PKCE_VERIFIER_MISSING" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("opaque-code");
    log.mockRestore();
  });

  it("emits fixed callback outcomes and allowlists documented Auth error codes", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { code: "bad_code_verifier", message: "secret detail" } });
    await GET(new Request("https://moneymachine-eta.vercel.app/auth/callback?code=opaque-code"));
    expect(log).toHaveBeenCalledWith("AUTH_CALLBACK_DIAGNOSTIC", {
      event: "AUTH_CALLBACK_EXCHANGE_REJECTED",
      supabaseErrorCode: "bad_code_verifier",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret detail");
    expect(safeSupabaseAuthErrorCode({ code: "sensitive_unknown", message: "raw" }))
      .toBe("SUPABASE_AUTH_ERROR_UNKNOWN");

    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    log.mockClear();
    await GET(new Request("https://moneymachine-eta.vercel.app/auth/callback?code=opaque-code"));
    expect(log).toHaveBeenCalledWith("AUTH_CALLBACK_DIAGNOSTIC", { event: "AUTH_CALLBACK_EXCHANGE_SUCCEEDED" });
    log.mockRestore();
  });

  it("diagnoses missing code and wrong origin without logging request material", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await GET(new Request("https://moneymachine-eta.vercel.app/auth/callback"));
    expect(log).toHaveBeenCalledWith("AUTH_CALLBACK_DIAGNOSTIC", { event: "AUTH_CALLBACK_MISSING_CODE" });
    log.mockClear();
    await GET(new Request("https://alias.example/auth/callback?code=synthetic-code"));
    expect(log).toHaveBeenCalledWith("AUTH_CALLBACK_DIAGNOSTIC", { event: "AUTH_CALLBACK_WRONG_ORIGIN" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("synthetic-code");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
