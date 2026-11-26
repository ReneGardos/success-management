import type { Metadata, Viewport } from "next"
import { Inter, Manrope } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://success-management-ruddy.vercel.app"),
  title: { default: "Success Management", template: "%s · Success Management" },
  description: "Administration, vagtplan, tilbud og mail for servicevirksomheder.",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/favicon-192.png", sizes: "192x192", type: "image/png" }], apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" } },
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da" className={`${inter.variable} ${manrope.variable} bg-background`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
