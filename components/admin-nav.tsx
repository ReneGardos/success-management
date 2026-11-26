"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { BarChart3, Building2, CalendarDays, Clock, ExternalLink, FileSignature, FileText, Globe, LayoutDashboard, LogOut, Mail, MapPin, Menu, Settings, ShieldCheck, Users, X } from "lucide-react"

const groups = [
  { title: "Drift", links: [
    { href: "/admin", label: "Overblik", icon: LayoutDashboard, exact: true },
    { href: "/admin/vagtplan", label: "Vagtplan", icon: CalendarDays },
    { href: "/admin/timer", label: "Timer", icon: Clock },
    { href: "/admin/steder", label: "Steder", icon: MapPin },
  ] },
  { title: "Kunder og salg", links: [
    { href: "/admin/mail", label: "Mail", icon: Mail },
    { href: "/admin/tilbud", label: "Tilbud", icon: FileSignature },
    { href: "/admin/leads", label: "Leads", icon: FileText },
  ] },
  { title: "Team og system", links: [
    { href: "/admin/statistik", label: "Statistik", icon: BarChart3 },
    { href: "/admin/brugere", label: "Medarbejdere", icon: Users },
    { href: "/admin/hjemmesider", label: "Hjemmesider og API", icon: Globe },
    { href: "/admin/indstillinger", label: "Indstillinger", icon: Settings },
  ] },
]

const allLinks = groups.flatMap((g) => g.links)

type NavOrg = { id: string; name: string; logoUrl: string | null; website: string | null }
type NavMembership = { orgId: string; name: string; role: string }

/** Admin sidebar + topbar with organization switcher. */
export default function AdminNav({ org, memberships, isSuperadmin }: { org: NavOrg; memberships: NavMembership[]; isSuperadmin: boolean }) {
  const pathname = usePathname() ?? ""
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href))
  const current = [...allLinks].sort((a, b) => b.href.length - a.href.length).find((l) => isActive(l.href, l.exact))

  return (
    <>
      <aside className={`adm-sidebar${open ? " is-open" : ""}`} aria-label="Administration">
        <div className="adm-brand">
          <Link href="/admin" className="adm-brand-name">
            {org.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={org.logoUrl} alt={org.name} className="adm-brand-logo" />
              : <><Building2 className="size-5" aria-hidden="true" /> <span>{org.name}</span></>}
          </Link>
          <button type="button" className="adm-sidebar-close" onClick={() => setOpen(false)} aria-label="Luk menu"><X className="size-5" /></button>
        </div>
        {(memberships.length > 1 || isSuperadmin) && (
          <form action="/org/skift" method="get" className="adm-org-switch">
            <label htmlFor="adm-org">Virksomhed</label>
            <select id="adm-org" name="org" defaultValue={org.id} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
              {!memberships.some((m) => m.orgId === org.id) && <option value={org.id}>{org.name} (superadmin)</option>}
              {memberships.map((m) => <option key={m.orgId} value={m.orgId}>{m.name}</option>)}
            </select>
            <noscript><button type="submit">Skift</button></noscript>
          </form>
        )}
        <nav className="adm-menu">
          {groups.map((g) => (
            <div key={g.title} className="adm-menu-group">
              <p className="adm-menu-title">{g.title}</p>
              {g.links.map(({ href, label, icon: Icon, exact }) => (
                <Link key={href} href={href} aria-current={isActive(href, exact) ? "page" : undefined}>
                  <Icon className="size-[18px]" aria-hidden="true" /><span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="adm-sidebar-foot">
          {isSuperadmin && <Link href="/superadmin"><ShieldCheck className="size-4" aria-hidden="true" /> Superadmin</Link>}
          {org.website && <a href={`https://${org.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" aria-hidden="true" /> Se hjemmesiden</a>}
        </div>
      </aside>
      {open && <button type="button" className="adm-backdrop" aria-label="Luk menu" onClick={() => setOpen(false)} />}

      <header className="adm-topbar">
        <button type="button" className="adm-toggle" onClick={() => setOpen(true)} aria-label="Åbn menu" aria-expanded={open}><Menu className="size-5" /></button>
        <nav aria-label="Brødkrumme" className="adm-crumbs"><Link href="/admin">{org.name}</Link>{current && current.href !== "/admin" && <><span>/</span><strong>{current.label}</strong></>}</nav>
        <div className="adm-topbar-actions">
          <Link href="/admin/vagtplan?ny=1" className="adm-btn adm-btn-primary adm-hide-sm">+ Ny vagt</Link>
          <Link href="/admin/tilbud" className="adm-btn adm-btn-light adm-hide-sm">Tilbud</Link>
          <form action="/auth/sign-out" method="post"><button type="submit" className="adm-btn adm-btn-light" aria-label="Log ud"><LogOut className="size-4" aria-hidden="true" /><span className="adm-hide-sm">Log ud</span></button></form>
        </div>
      </header>
    </>
  )
}
