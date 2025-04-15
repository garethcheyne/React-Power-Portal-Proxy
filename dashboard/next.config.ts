import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Add loader for .md files
    config.module.rules.push({
      test: /\.md$/,
      use: 'raw-loader'
    });
    
    return config;
  }
};

export default nextConfig;
