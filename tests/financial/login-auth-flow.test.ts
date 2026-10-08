import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => { throw new Error(`REDIRECT:${destination}`); }),
  getSupabaseServerClient: vi.fn(),
  signInWithOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: mocks.getSupabaseServerClient }));

import { getAuthApplicationOrigin, getAuthCallbackUrl, safePostAuthPath } from "@/lib/auth/callback-url";
import { GET } from "@/app/auth/callback/route";
import { requestMagicLink } from "@/app/login/actions";
import { getLoginNotice } from "@/app/login/notices";
import LoginPage from "@/app/login/page";
import { renderToStaticMarkup } from "react-dom/server";

describe("login callback configuration and flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://moneymachine-eta.vercel.app";
    mocks.signInWithOtp.mockResolvedValue({ error: null });
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

  it("exchanges a PKCE code and redirects on the configured app origin", async () => {
    const response = await GET(new Request("https://untrusted.example/auth/callback?code=opaque-code&next=%2Fdashboard%3Ftab%3Dpaper"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("opaque-code");
    expect(response.headers.get("location")).toBe("https://moneymachine-eta.vercel.app/dashboard?tab=paper");
  });

  it("rejects external post-auth destinations and does not fall back to request Host", async () => {
    const response = await GET(new Request("https://untrusted.example/auth/callback?code=opaque-code&next=%2F%2Fevil.example"));
    expect(response.headers.get("location")).toBe("https://moneymachine-eta.vercel.app/dashboard");
    expect(safePostAuthPath("/\\evil.example")).toBe("/dashboard");
  });

  it("shows a safe callback error when code exchange fails", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("provider detail / account@example.test") });
    const response = await GET(new Request("https://untrusted.example/auth/callback?code=opaque-code"));
    expect(response.headers.get("location")).toBe("https://moneymachine-eta.vercel.app/login?error=oauth-callback");
  });
});
