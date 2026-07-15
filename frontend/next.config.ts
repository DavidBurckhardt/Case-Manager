import type { NextConfig } from "next";

const isDocker = process.env.BUILD_TARGET === 'docker'

const nextConfig: NextConfig = {
  // 'standalone' only needed for Docker — Vercel manages its own output format
  // and using standalone there causes __dirname errors in Edge Runtime.
  ...(isDocker ? { output: 'standalone' } : {}),
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
