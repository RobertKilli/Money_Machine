"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Upstream Next loads this adapter synchronously through CommonJS.
const { globSync, isDynamicPattern } = require("tinyglobby");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Synchronous filesystem observation preserves directory-symlink results.
const { readdirSync, statSync } = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- The calling plugin is CommonJS.
const { isAbsolute, relative, resolve } = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- The calling plugin is CommonJS.
const picomatch = require("picomatch");

// Scoped to Next's getRootDirs; this is not the full fast-glob API.
module.exports = {
  globSync(pattern, options) {
    if (typeof pattern !== "string" || options?.onlyDirectories !== true || Object.keys(options).some(key => key !== "onlyDirectories")) {
      throw new TypeError("Unsupported Next root-directory glob invocation");
    }
    if (pattern.startsWith("!") && !pattern.startsWith("!(")) return [];
    // fast-glob excludes the base directory of a terminal globstar.
    const search = pattern === "**" ? "**/*" : pattern.replace(/\/\*\*\/?$/, "/**/*");
    const links = new Set();
    const paths = globSync(search, {
      onlyDirectories: true, expandDirectories: false, followSymbolicLinks: true, absolute: isAbsolute(pattern),
      fs: { readdirSync(directory, settings) {
        const entries = readdirSync(directory, settings);
        for (const entry of entries) {
          if (typeof entry === "object" && entry.isSymbolicLink()) {
            const path = resolve(String(directory), entry.name);
            try { if (statSync(path).isDirectory()) links.add(path); }
            catch (error) { if (!["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) throw error; }
          }
        }
        return entries;
      } },
    });
    // tinyglobby traverses directory links but omits the link directory itself.
    // Add only matching aliases; keep its traversal and cycle handling intact.
    const matches = picomatch(search, { dot: false, posix: true });
    for (const link of links) {
      let path = (isAbsolute(pattern) ? link : relative(process.cwd(), link)).replaceAll("\\", "/");
      if (pattern.startsWith("./")) path = `./${path}`;
      if (matches(path) || matches(`${path}/`)) paths.push(path);
    }
    const literalTrailingSlash = pattern.endsWith("/") && !isDynamicPattern(pattern);
    return [...new Set(paths.map(path => {
      if (path !== "/" && path.endsWith("/") && !literalTrailingSlash) path = path.slice(0, -1);
      if (literalTrailingSlash && path !== "/" && !path.endsWith("/")) path += "/";
      if (pattern.startsWith("./") && !path.startsWith("./")) path = `./${path}`;
      return path;
    }))];
  },
};
