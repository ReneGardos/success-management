"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, CalendarOff, ClipboardList, Clock, FileText, Home, MessageSquareWarning, PackageOpen, Receipt, ShoppingBag, User } from "lucide-react"

const icons = { home: Home, calendar: CalendarDays, clock: Clock, off: CalendarOff, box: PackageOpen, user: User, report: ClipboardList, quote: FileText, invoice: Receipt, order: ShoppingBag, feedback: MessageSquareWarning }
export type NavItem = { href: string; label: string; icon: keyof typeof icons; badge?: number }

/** Tabs at the top on tablet/desktop and a bottom bar on phones. */
export default function PortalNav({ items, root }: { items: NavItem[]; root: string }) {
  const path = usePathname() ?? ""
  const active = (href: string) => (href === root ? path === root : path.startsWith(href))
  return (
    <nav className="pt-nav" aria-label="Menu">
      {items.map((it) => {
        const Icon = icons[it.icon]
        return (
          <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined}>
            <Icon className="size-5" aria-hidden="true" />
            <span>{it.label}</span>
            {it.badge ? <b>{it.badge}</b> : null}
          </Link>
        )
      })}
    </nav>
  )
}
