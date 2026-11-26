import AdminNav from "@/components/admin-nav"
import { requireRolePage } from "@/lib/auth-guard"
import { brandStyle } from "@/lib/brand"
import "./admin-theme.css"
import "./crm.css"

export const metadata = { title: { default: "Administration", template: "%s · Success Management" }, robots: { index: false, follow: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { org, ctx } = await requireRolePage(["admin"], "/admin")
  return (
    <div className="admin-frame" style={brandStyle(org)}>
      <AdminNav
        org={{ id: org.id, name: org.name, logoUrl: org.logo_url, website: org.website }}
        memberships={ctx.memberships.map((m) => ({ orgId: m.orgId, name: m.name, role: m.role }))}
        isSuperadmin={ctx.isSuperadmin}
      />
      <div className="adm-content">{children}</div>
    </div>
  )
}
