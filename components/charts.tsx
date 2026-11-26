/** Lightweight server-rendered SVG charts for the admin dashboard. Hover shows native tooltips. */

type Series = { name: string; color: string; values: number[] }

const fmt = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 })}k` : n.toLocaleString("da-DK", { maximumFractionDigits: 1 }))

function niceMax(v: number) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** Smooth area/line chart for one or more series over the same labels. */
export function AreaChart({ series, labels, height = 220, id }: { series: Series[]; labels: string[]; height?: number; id: string }) {
  const W = 640
  const H = height
  const pad = { l: 34, r: 10, t: 12, b: 26 }
  const n = Math.max(1, labels.length)
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)))
  const x = (i: number) => pad.l + (n === 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const path = (vals: number[]) => vals.map((v, i) => {
    if (i === 0) return `M${x(0)},${y(v)}`
    const px = x(i - 1), py = y(vals[i - 1]), cx = (px + x(i)) / 2
    return `C${cx},${py} ${cx},${y(v)} ${x(i)},${y(v)}`
  }).join(" ")
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const every = Math.max(1, Math.ceil(n / 7))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="crm-chart" role="img" aria-label={series.map((s) => s.name).join(" og ")}>
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`${id}-g${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity=".22" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="crm-grid" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="crm-axis">{fmt(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % every === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="crm-axis">{l}</text>)}
      {series.map((s, i) => (
        <g key={s.name}>
          <path d={`${path(s.values)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id}-g${i})`} />
          <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinecap="round" />
          {s.values.map((v, j) => (
            <circle key={j} cx={x(j)} cy={y(v)} r={n > 20 ? 6 : 8} fill="transparent" className="crm-hit">
              <title>{`${labels[j]} · ${s.name}: ${v.toLocaleString("da-DK")}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  )
}

/** Vertical bar chart. */
export function BarChart({ values, labels, color, height = 200, unit = "", highlightLast = true }: { values: number[]; labels: string[]; color: string; height?: number; unit?: string; highlightLast?: boolean }) {
  const W = 640
  const H = height
  const pad = { l: 34, r: 10, t: 12, b: 26 }
  const n = Math.max(1, values.length)
  const max = niceMax(Math.max(1, ...values))
  const slot = (W - pad.l - pad.r) / n
  const bw = Math.min(46, slot * 0.62)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="crm-chart" role="img" aria-label="Søjlediagram">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t * max)} y2={y(t * max)} className="crm-grid" />
          <text x={pad.l - 6} y={y(t * max) + 4} textAnchor="end" className="crm-axis">{fmt(t * max)}</text>
        </g>
      ))}
      {values.map((v, i) => {
        const cx = pad.l + slot * i + slot / 2
        const top = y(v)
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(0, y(0) - top)} rx="6" fill={color} opacity={highlightLast && i !== n - 1 ? 0.45 : 1}>
              <title>{`${labels[i]}: ${v.toLocaleString("da-DK", { maximumFractionDigits: 1 })}${unit}`}</title>
            </rect>
            <text x={cx} y={H - 6} textAnchor="middle" className="crm-axis">{labels[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** Donut with centre label. */
export function Donut({ segments, label, sub, size = 168 }: { segments: { name: string; value: number; color: string }[]; label: string; sub?: string; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = 60
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} className="crm-donut" role="img" aria-label={segments.map((s) => `${s.name} ${s.value}`).join(", ")}>
      <circle cx="80" cy="80" r={r} fill="none" stroke="var(--crm-track)" strokeWidth="18" />
      {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
        const len = (s.value / total) * c
        const el = (
          <circle key={s.name} cx="80" cy="80" r={r} fill="none" stroke={s.color} strokeWidth="18" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)">
            <title>{`${s.name}: ${s.value}`}</title>
          </circle>
        )
        offset += len
        return el
      })}
      <text x="80" y="78" textAnchor="middle" className="crm-donut-label">{label}</text>
      {sub && <text x="80" y="98" textAnchor="middle" className="crm-donut-sub">{sub}</text>}
    </svg>
  )
}

/** Tiny trend line for KPI cards. */
export function Sparkline({ values, color, width = 110, height = 34 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const step = width / (values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - (v / max) * (height - 6)).toFixed(1)}`)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="crm-spark" aria-hidden="true">
      <polyline points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={color} opacity=".12" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Horizontal bars, e.g. pipeline stages or top pages. */
export function HBars({ rows, color }: { rows: { label: string; value: number; hint?: string }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="crm-hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="crm-hbars-head"><span>{r.label}</span><strong>{r.hint ?? r.value.toLocaleString("da-DK")}</strong></div>
          <div className="crm-hbars-track"><i style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** "+12 %" style change badge. */
export function Delta({ now, before, inverse = false }: { now: number; before: number; inverse?: boolean }) {
  if (!before && !now) return <span className="crm-delta is-flat">±0</span>
  if (!before) return <span className="crm-delta is-up">Ny</span>
  const pct = Math.round(((now - before) / before) * 100)
  const good = inverse ? pct < 0 : pct > 0
  return <span className={`crm-delta ${pct === 0 ? "is-flat" : good ? "is-up" : "is-down"}`}>{pct > 0 ? "▲" : pct < 0 ? "▼" : "±"} {Math.abs(pct)} %</span>
}
