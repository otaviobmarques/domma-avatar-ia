import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "200mb" } },
};

export default nextConfig;
