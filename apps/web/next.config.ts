import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@plantifiles/core", "@plantifiles/db"],
};

export default nextConfig;
