import AdminNav from "@/components/admin-nav"
import { requireRolePage } from "@/lib/auth-guard"
import { brandStyle } from "@/lib/brand"
import { createAdminClient } from "@/lib/supabase/admin"
import { vapidPublicKey } from "@/lib/backend/push"
import "./admin-theme.css"
import "./crm.css"

export const metadata = { title: { default: "Administration", template: "%s · Success Management" }, robots: { index: false, follow: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { org, ctx } = await requireRolePage(["admin"], "/admin")
  const db = createAdminClient()
  const [{ data: threads }, { count: absences }, { count: visits }] = await Promise.all([
    db.from("chat_threads").select("last_message_at, office_read_at, last_from_office").eq("org_id", org.id).not("last_message_at", "is", null).limit(500),
    db.from("employee_absences").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending"),
    db.from("visit_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending"),
  ])
  const unreadChats = (threads ?? []).filter((t) => !t.last_from_office && (!t.office_read_at || t.office_read_at < t.last_message_at!)).length
  return (
    <div className="admin-frame" style={brandStyle(org)}>
      <AdminNav
        org={{ id: org.id, name: org.name, logoUrl: org.logo_url, website: org.website }}
        memberships={ctx.memberships.map((m) => ({ orgId: m.orgId, name: m.name, role: m.role }))}
        isSuperadmin={ctx.isSuperadmin}
        pushKey={vapidPublicKey()}
        badges={{ "/admin/beskeder": unreadChats, "/admin/fravaer": absences ?? 0, "/admin/besoeg": visits ?? 0 }}
      />
      <div className="adm-content">{children}</div>
    </div>
  )
}
