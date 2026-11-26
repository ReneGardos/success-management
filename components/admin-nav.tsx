"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import NotificationBell from "@/components/notification-bell"
import { Zap, CalendarClock, MessagesSquare, BarChart3, Building2, Eye, CalendarDays, CalendarOff, ClipboardCheck, Clock, Contact, ListChecks, MessageCircleWarning, PackageOpen, ExternalLink, FileSignature, Globe, Kanban, LayoutDashboard, LogOut, Mail, MapPin, Menu, Receipt, Search, Settings, ShieldCheck, Users, X } from "lucide-react"

const groups = [
  { title: "Drift", links: [
    { href: "/admin", label: "Overblik", icon: LayoutDashboard, exact: true },
    { href: "/admin/vagtplan", label: "Vagtplan", icon: CalendarDays },
    { href: "/admin/timer", label: "Timer", icon: Clock },
    { href: "/admin/fravaer", label: "Fravær", icon: CalendarOff },
    { href: "/admin/besoeg", label: "Kundeønsker", icon: CalendarClock },
    { href: "/admin/steder", label: "Steder", icon: MapPin },
    { href: "/admin/rapporter", label: "Rapporter", icon: ClipboardCheck },
    { href: "/admin/forsyning", label: "Forsyning", icon: PackageOpen },
  ] },
  { title: "Kunder og salg", links: [
    { href: "/admin/mail", label: "Indbakke", icon: Mail },
    { href: "/admin/beskeder", label: "Beskeder", icon: MessagesSquare },
    { href: "/admin/leads", label: "Pipeline", icon: Kanban },
    { href: "/admin/kunder", label: "Kunder", icon: Contact },
    { href: "/admin/tilbud", label: "Tilbud", icon: FileSignature },
    { href: "/admin/fakturaer", label: "Fakturaer", icon: Receipt },
    { href: "/admin/prisliste", label: "Prisliste", icon: ListChecks },
    { href: "/admin/feedback", label: "Kundefeedback", icon: MessageCircleWarning },
  ] },
  { title: "Team og system", links: [
    { href: "/admin/statistik", label: "Statistik", icon: BarChart3 },
    { href: "/admin/brugere", label: "Medarbejdere", icon: Users },
    { href: "/admin/se-som", label: "Se som medarbejder/kunde", icon: Eye },
    { href: "/admin/automatisering", label: "Automatisering", icon: Zap },
    { href: "/admin/hjemmesider", label: "Hjemmesider og API", icon: Globe },
    { href: "/admin/indstillinger", label: "Indstillinger", icon: Settings },
  ] },
]

const allLinks = groups.flatMap((g) => g.links)

type NavOrg = { id: string; name: string; logoUrl: string | null; website: string | null }
type NavMembership = { orgId: string; name: string; role: string }

/** Admin sidebar + topbar with organization switcher. */
export default function AdminNav({ org, memberships, isSuperadmin, pushKey = "", badges = {} }: { org: NavOrg; memberships: NavMembership[]; isSuperadmin: boolean; pushKey?: string; badges?: Record<string, number> }) {
  const pathname = usePathname() ?? ""
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) {
        e.preventDefault()
        document.querySelector<HTMLInputElement>(".adm-search input")?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
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
                  <Icon className="size-[18px]" aria-hidden="true" /><span>{label}</span>{badges[href] ? <b className="adm-badge">{badges[href]}</b> : null}
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
        <form action="/admin/soeg" method="get" className="adm-search" role="search">
          <Search className="size-4" aria-hidden="true" />
          <input name="q" type="search" placeholder="Søg kunder, leads, tilbud, fakturaer…" aria-label="Søg" />
          <kbd className="adm-hide-sm">/</kbd>
        </form>
        <div className="adm-topbar-actions">
          <NotificationBell pushKey={pushKey} />
          <Link href="/admin/fakturaer" className="adm-btn adm-btn-light adm-hide-sm">Faktura</Link>
          <Link href="/admin/vagtplan?ny=1" className="adm-btn adm-btn-primary adm-hide-sm">+ Ny vagt</Link>
          <form action="/auth/sign-out" method="post"><button type="submit" className="adm-btn adm-btn-light" aria-label="Log ud"><LogOut className="size-4" aria-hidden="true" /><span className="adm-hide-sm">Log ud</span></button></form>
        </div>
      </header>
    </>
  )
}
