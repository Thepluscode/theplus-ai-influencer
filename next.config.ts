import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Pin Turbopack's project root so it stops walking up to ~/package-lock.json.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
