import { afterEach, describe, expect, it } from "vitest";
import { hasExpectedPkceVerifierCookie } from "@/lib/auth/pkce-verifier-cookie";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

function setGlobal(name: "window" | "document", value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

describe("Google PKCE start", () => {
  it("stores a verifier cookie through the configured browser client without contacting a provider", async () => {
    const jar = new Map<string, string>();
    const documentStub = {
      get cookie() {
        return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
      },
      set cookie(serialized: string) {
        const [pair] = serialized.split(";");
        const separator = pair.indexOf("=");
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      },
    };
    setGlobal("document", documentStub);
    setGlobal("window", { document: documentStub, location: { assign: () => undefined } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://flsfallpputejojncyue.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";

    const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser");
    const supabase = getSupabaseBrowserClient();
    expect(supabase).not.toBeNull();
    const { data, error } = await supabase!.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://moneymachine-eta.vercel.app/auth/callback",
        skipBrowserRedirect: true,
      },
    });

    expect(error).toBeNull();
    expect(data.provider).toBe("google");
    expect([...jar.keys()].some((name) =>
      name === "sb-flsfallpputejojncyue-auth-token-code-verifier"
      || /^sb-flsfallpputejojncyue-auth-token-flow-[A-Za-z0-9_-]{8,64}-code-verifier(?:\.\d+)?$/.test(name),
    )).toBe(true);
    expect(hasExpectedPkceVerifierCookie(
      [...jar.entries()].map(([name, value]) => ({ name, value })),
      "https://flsfallpputejojncyue.supabase.co",
    )).toBe(true);
    await supabase!.auth.stopAutoRefresh();
  });
});
