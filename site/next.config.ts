import type { NextConfig } from "next";

const isPages = process.env.GITHUB_PAGES === "true";
const repo = "pinch-of-rust";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fully static build for GitHub Pages.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Pages serves a project site from /<repo>/, so links and assets need the prefix.
  basePath: isPages ? `/${repo}` : undefined,
  assetPrefix: isPages ? `/${repo}/` : undefined,
};

export default nextConfig;
