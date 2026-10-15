import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: "/editor/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // credentialless: SharedArrayBuffer for ffmpeg + HuggingFace model CDN
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
      {
        // Next workers / chunks loaded from COEP pages need matching policy
        source: "/_next/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
      {
        // ffmpeg.wasm worker.js must carry COEP or Chrome blocks it
        source: "/ffmpeg/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
  serverExternalPackages: ["@huggingface/transformers"],
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      sharp$: false,
      "onnxruntime-node$": false,
    };
    if (isServer) {
      // Browser-only packages — stub on the server
      config.resolve.alias = {
        ...config.resolve.alias,
        "@ffmpeg/ffmpeg": false,
        "@ffmpeg/util": false,
      };
    }
    return config;
  },
};

export default nextConfig;
