import PortalShell from "@/components/portal-shell"
import { createAdminClient } from "@/lib/supabase/admin"
import { employeePortal } from "@/lib/portal"

export const metadata = { title: { default: "Medarbejder", template: "%s · Medarbejder" }, robots: { index: false, follow: false } }

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const p = await employeePortal()
  const { count: openShifts } = await createAdminClient().from("jobs").select("id", { count: "exact", head: true }).eq("org_id", p.org.id).eq("is_open", true).neq("status", "cancelled").gte("scheduled_start", new Date().toISOString())
  return (
    <PortalShell
      org={p.org}
      title={p.org.name}
      subtitle={`Medarbejder · ${p.name.split(" ")[0]}`}
      root="/medarbejder"
      preview={p.preview}
      canSwitch={p.ctx.memberships.length > 1}
      items={[
        { href: "/medarbejder", label: "I dag", icon: "home" },
        { href: "/medarbejder/vagter", label: "Vagter", icon: "calendar", badge: openShifts ?? 0 },
        { href: "/medarbejder/timer", label: "Timer", icon: "clock" },
        { href: "/medarbejder/fravaer", label: "Fravær", icon: "off" },
        { href: "/medarbejder/mangler", label: "Mangler", icon: "box" },
        { href: "/medarbejder/profil", label: "Profil", icon: "user" },
      ]}
    >
      {children}
    </PortalShell>
  )
}
