import type { NextConfig } from "next";

// The live smoke CLI is a separate Node process. Next loads .env files before
// this config, so remove this server-only provider key before build workers or
// output caches can inherit it.
delete process.env.COINGECKO_DEMO_API_KEY;

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
