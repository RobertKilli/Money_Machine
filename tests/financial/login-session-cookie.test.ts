import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  },
  createServerClient: vi.fn(),
  cookieOptions: undefined as undefined | { cookies: { setAll: (values: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void } },
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (url: string, key: string, options: typeof mocks.cookieOptions) => {
    mocks.createServerClient(url, key, options);
    mocks.cookieOptions = options;
    return {
      auth: {
        exchangeCodeForSession: async () => {
          options?.cookies.setAll([{ name: "sb-auth-token", value: "test-session-cookie", options: { httpOnly: true, sameSite: "lax" } }]);
          return { error: null };
        },
      },
    };
  },
}));

import { GET } from "@/app/auth/callback/route";

describe("PKCE callback session cookie flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://moneymachine-eta.vercel.app";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://flsfallpputejojncyue.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  });

  it("stores exchanged session cookies through the server client adapter", async () => {
    const response = await GET(new Request("https://moneymachine-eta.vercel.app/auth/callback?code=opaque-code"));
    expect(response.headers.get("location")).toBe("https://moneymachine-eta.vercel.app/dashboard");
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://flsfallpputejojncyue.supabase.co",
      "test-public-key",
      expect.any(Object),
    );
    expect(mocks.cookieStore.set).toHaveBeenCalledWith("sb-auth-token", "test-session-cookie", { httpOnly: true, sameSite: "lax" });
  });
});
