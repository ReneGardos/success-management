import type { ReactNode } from "react"

/** Tiny, safe Markdown subset → React (##/### headings, -/1. lists, **bold**, *italic*, paragraphs). No HTML is ever injected. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    out.push(t.startsWith("**") ? <strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong> : <em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text, className = "md" }: { text: string | null | undefined; className?: string }) {
  const lines = (text ?? "").replace(/\r/g, "").split("\n")
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => { if (para.length) { blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>); para = [] } }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>)
    blocks.push(list.ordered ? <ol key={`o${blocks.length}`}>{items}</ol> : <ul key={`u${blocks.length}`}>{items}</ul>)
    list = null
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    const ul = /^\s*[-*]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (!line.trim()) { flushPara(); flushList(); continue }
    if (h) { flushPara(); flushList(); const lvl = h[1].length; blocks.push(lvl === 1 ? <h2 key={`h${blocks.length}`}>{inline(h[2], `h${blocks.length}`)}</h2> : lvl === 2 ? <h3 key={`h${blocks.length}`}>{inline(h[2], `h${blocks.length}`)}</h3> : <h4 key={`h${blocks.length}`}>{inline(h[2], `h${blocks.length}`)}</h4>); continue }
    if (ul || ol) { flushPara(); const ordered = Boolean(ol); if (list && list.ordered !== ordered) flushList(); list ??= { ordered, items: [] }; list.items.push((ul ?? ol)![1]); continue }
    flushList()
    para.push(line.trim())
  }
  flushPara(); flushList()
  return <div className={className}>{blocks}</div>
}
