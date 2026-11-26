import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Success Management",
    short_name: "Success",
    description: "Vagter, rapporter, beskeder og fakturaer – for medarbejdere, kunder og kontor.",
    id: "/",
    start_url: "/start",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F5F0",
    theme_color: "#102D46",
    lang: "da",
    categories: ["business", "productivity"],
    icons: [
      { src: "/favicon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/favicon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mine vagter", url: "/medarbejder/vagter" },
      { name: "Beskeder", url: "/beskeder" },
    ],
  }
}
