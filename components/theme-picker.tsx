import { Monitor, Moon, Sun } from "lucide-react"
import { setTheme } from "@/app/tema/actions"

/** Three buttons that save the theme choice (server action, works without JS). */
export default function ThemePicker({ current }: { current: string }) {
  const opts = [{ v: "auto", label: "Automatisk", Icon: Monitor }, { v: "light", label: "Lys", Icon: Sun }, { v: "dark", label: "Mørk", Icon: Moon }]
  return (
    <form action={setTheme} className="theme-pick">
      {opts.map(({ v, label, Icon }) => (
        <button key={v} type="submit" name="theme" value={v} aria-pressed={current === v} className={current === v ? "is-on" : ""}><Icon className="size-5" /> {label}</button>
      ))}
    </form>
  )
}
