import PortalShell from "@/components/portal-shell"
import { createAdminClient } from "@/lib/supabase/admin"
import { customerPortal } from "@/lib/portal"
import { memberUnread } from "@/lib/backend/chat"

export const metadata = { title: { default: "Kundeportal", template: "%s · Kundeportal" }, robots: { index: false, follow: false } }

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const p = await customerPortal()
  const [{ count: unpaid }, unread] = await Promise.all([
    createAdminClient().from("invoices").select("id", { count: "exact", head: true }).eq("org_id", p.org.id).eq("status", "sent").in("customer_id", p.ids),
    memberUnread(p.org.id, "customer", p.customerIds[0]),
  ])
  const c = p.customers[0]
  return (
    <PortalShell
      org={p.org}
      title={p.org.name}
      subtitle={`Kundeportal${c ? ` · ${c.company || c.name}` : ""}`}
      root="/kunde"
      preview={p.preview}
      canSwitch={p.ctx.memberships.length > 1}
      items={[
        { href: "/kunde", label: "Oversigt", icon: "home" },
        { href: "/kunde/beskeder", label: "Beskeder", icon: "chat", badge: unread },
        { href: "/kunde/rapporter", label: "Rapporter", icon: "report" },
        { href: "/kunde/fakturaer", label: "Fakturaer", icon: "invoice", badge: unpaid ?? 0 },
        { href: "/kunde/tilbud", label: "Tilbud", icon: "quote" },
        { href: "/kunde/bestil", label: "Bestil", icon: "order" },
        { href: "/kunde/feedback", label: "Feedback", icon: "feedback" },
        { href: "/kunde/profil", label: "Profil", icon: "user" },
      ]}
    >
      {children}
    </PortalShell>
  )
}
