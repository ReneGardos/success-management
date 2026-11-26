import Link from "next/link"
import { cookies } from "next/headers"
import type { Org } from "@/lib/org"
import type { ViewAs } from "@/lib/view-as"
import ViewAsBanner from "@/components/view-as-banner"
import NotificationBell from "@/components/notification-bell"
import { vapidPublicKey } from "@/lib/backend/push"
import PortalNav, { type NavItem } from "@/components/portal-nav"

/** Branded frame for the employee and customer areas. */
export default async function PortalShell({ org, title, subtitle, items, root, preview, canSwitch, children }: {
  org: Org; title: string; subtitle: string; items: NavItem[]; root: string; preview: ViewAs | null; canSwitch: boolean; children: React.ReactNode
}) {
  const logo = org.logo_url || org.email_logo_url
  const theme = (await cookies()).get("sm_theme")?.value
  const themeClass = theme === "dark" ? " pt-theme-dark" : theme === "light" ? " pt-theme-light" : ""
  return (
    <div className={`pt${themeClass}${preview ? " viewas-readonly" : ""}`} style={{ ["--primary" as string]: org.color_primary, ["--accent" as string]: org.color_accent, ["--pt-bg" as string]: org.color_background }}>
      {preview && <ViewAsBanner viewAs={preview} />}
      <header className="pt-top">
        <Link href={root} className="pt-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt={org.name} /> : <span className="pt-mark">{org.name.slice(0, 1)}</span>}
          <span><strong>{title}</strong><small>{subtitle}</small></span>
        </Link>
        <div className="pt-top-actions">
          {!preview && <NotificationBell pushKey={vapidPublicKey()} tone="dark" />}
          {canSwitch && <Link href="/vaelg-virksomhed?skift=1">Skift virksomhed</Link>}
          <form action="/auth/sign-out" method="post"><button type="submit">Log ud</button></form>
        </div>
      </header>
      <PortalNav items={items} root={root} />
      <div className="pt-body">{children}</div>
    </div>
  )
}
