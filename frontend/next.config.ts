import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // pdf-parse pulls in @napi-rs/canvas which references DOMMatrix at module
  // evaluation time — bundling it breaks the Next.js build. Keep it external
  // so Node.js requires it directly from node_modules at runtime instead.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
