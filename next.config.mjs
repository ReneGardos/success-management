import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Logo and banner uploads in admin (max 2 MB image)
    serverActions: { bodySizeLimit: "3mb" },
  },
  turbopack: { root: __dirname },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }] }]
  },
}

export default nextConfig
