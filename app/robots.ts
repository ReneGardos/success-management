import type { MetadataRoute } from "next"

/** Only the landing page is public; the app itself stays out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/$", disallow: ["/admin", "/medarbejder", "/kunde", "/auth", "/t/", "/f/", "/api", "/superadmin", "/vaelg-virksomhed", "/org"] }] }
}
