import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import rulesBefore from "../fixtures/next-lint-rules-baseline.json";
import pluginBefore from "../fixtures/next-lint-plugin-baseline.json";
import globBefore from "../fixtures/next-root-glob-baseline.json";

const require = createRequire(import.meta.url);
const pluginRoot = dirname(require.resolve("@next/eslint-plugin-next/package.json"));
const pluginRequire = createRequire(join(pluginRoot, "package.json"));
const adapter = pluginRequire("fast-glob") as { globSync(pattern: string, options: unknown): string[] };
const getRootDirs = pluginRequire("./dist/utils/get-root-dirs.js").getRootDirs as (context: unknown) => string[];

describe("Next lint glob security remediation", () => {
  it("preserves every upstream plugin file and every effective lint rule", async () => {
    const hashes: Record<string, string> = {};
    function visit(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else hashes[relative(join(pluginRoot, "dist"), path).replaceAll("\\", "/")] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
    }
    visit(join(pluginRoot, "dist"));
    expect(hashes).toEqual(pluginBefore.distSha256);
    expect(JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8")).version).toBe(pluginBefore.version);
    const config = await new ESLint().calculateConfigForFile("src/app/page.tsx");
    expect(config.rules).toEqual(rulesBefore);
  });

  it("matches baseline directory discovery for literals, braces, extglobs, globstars and symlinks", () => {
    const base = mkdtempSync(join(tmpdir(), "next-root-matrix-"));
    try {
      for (const path of ["apps/web/src/app/dashboard", "apps/admin/pages", "apps/mobile", "apps/.hidden", "packages/lib", "docs"]) mkdirSync(join(base, path), { recursive: true });
      writeFileSync(join(base, "apps/file.txt"), "not a directory");
      symlinkSync(join(base, "apps/web"), join(base, "apps/linked"), process.platform === "win32" ? "junction" : "dir");
      for (const test of globBefore) {
        const negative = test.pattern.startsWith("!");
        const pattern = (negative ? "!" : "") + base.replaceAll("\\", "/") + "/" + test.pattern.replace(/^!/, "");
        const found = getRootDirs({ cwd: base, settings: { next: { rootDir: pattern } } });
        expect(found.map(path => relative(base, path).replaceAll("\\", "/")).sort(), test.pattern).toEqual(test.expected.map(path => path.replace(/^\.\//, "").replace(/\/$/, "")).sort());
      }
      const roots = getRootDirs({ cwd: base, settings: { next: { rootDir: [join(base, "apps/web"), join(base, "apps/admin")] } } });
      // Next normalizes rootDir input to POSIX separators before fast-glob;
      // fast-glob therefore returns slash-normalized absolute paths on Windows too.
      expect(roots).toEqual([join(base, "apps/web"), join(base, "apps/admin")].map(path => path.replaceAll("\\", "/")));
      expect(getRootDirs({ cwd: base, settings: {} })).toEqual([base]);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it("preserves literal path spelling and fails loudly on unsupported API expansion", () => {
    expect(adapter.globSync("./src", { onlyDirectories: true })).toEqual(["./src"]);
    expect(adapter.globSync("src/", { onlyDirectories: true })).toEqual(["src/"]);
    expect(() => adapter.globSync("src", { onlyDirectories: true, dot: true })).toThrow("Unsupported Next root-directory glob invocation");
  });

  it("still reports internal anchors and async client components through the real config", async () => {
    const eslint = new ESLint();
    const [bad] = await eslint.lintText('"use client"; export default async function Page() { return <a href="/">Home</a>; }', { filePath: resolve("src/app/glob-remediation-probe.tsx") });
    expect(bad.messages.map(message => message.ruleId)).toEqual(expect.arrayContaining(["@next/next/no-html-link-for-pages", "@next/next/no-async-client-component"]));
    const [external] = await eslint.lintText('export default function Page() { return <a href="https://example.test/">External</a>; }', { filePath: resolve("src/app/glob-remediation-probe.tsx") });
    expect(external.messages.some(message => message.ruleId === "@next/next/no-html-link-for-pages")).toBe(false);
  });
});
