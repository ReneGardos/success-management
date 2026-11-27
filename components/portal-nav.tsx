"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText as DocIcon, GraduationCap, CalendarDays, CalendarOff, ClipboardList, Clock, FileText, Home, Map as MapIcon, MessageCircle, MessageSquareWarning, MoreHorizontal, PackageOpen, Receipt, ShoppingBag, User, X } from "lucide-react"

const icons = { home: Home, calendar: CalendarDays, clock: Clock, off: CalendarOff, box: PackageOpen, user: User, report: ClipboardList, quote: FileText, invoice: Receipt, order: ShoppingBag, feedback: MessageSquareWarning, chat: MessageCircle, map: MapIcon, course: GraduationCap, doc: DocIcon }
export type NavItem = { href: string; label: string; icon: keyof typeof icons; badge?: number }

/** Tabs at the top on tablet/desktop; on phones a bottom bar with the first four + "Mere". */
export default function PortalNav({ items, root }: { items: NavItem[]; root: string }) {
  const path = usePathname() ?? ""
  const [more, setMore] = useState(false)
  useEffect(() => setMore(false), [path])
  const active = (href: string) => (href === root ? path === root : path.startsWith(href))
  const primary = items.slice(0, 4)
  const rest = items.slice(4)
  const restBadge = rest.reduce((s, i) => s + (i.badge ?? 0), 0)
  const link = (it: NavItem, cls = "") => {
    const Icon = icons[it.icon]
    return (
      <Link key={it.href} href={it.href} className={cls} aria-current={active(it.href) ? "page" : undefined}>
        <Icon className="size-5" aria-hidden="true" />
        <span>{it.label}</span>
        {it.badge ? <b>{it.badge}</b> : null}
      </Link>
    )
  }
  return (
    <>
      <nav className="pt-nav" aria-label="Menu">
        {primary.map((it) => link(it))}
        {rest.map((it) => link(it, "pt-nav-wide"))}
        {rest.length > 0 && (
          <button type="button" className="pt-nav-more" aria-expanded={more} onClick={() => setMore((m) => !m)} aria-current={rest.some((r) => active(r.href)) ? "page" : undefined}>
            <MoreHorizontal className="size-5" aria-hidden="true" /><span>Mere</span>{restBadge ? <b>{restBadge}</b> : null}
          </button>
        )}
      </nav>
      {more && (
        <div className="pt-sheet" role="dialog" aria-label="Mere">
          <button type="button" className="pt-sheet-bg" aria-label="Luk" onClick={() => setMore(false)} />
          <div className="pt-sheet-card">
            <header><strong>Mere</strong><button type="button" onClick={() => setMore(false)} aria-label="Luk"><X className="size-5" /></button></header>
            <div className="pt-sheet-grid">{rest.map((it) => link(it))}</div>
          </div>
        </div>
      )}
    </>
  )
}
