/**
 * Small QR code encoder (byte mode, error correction M, versions 1–10) → SVG.
 * Enough for URLs up to ~210 characters. No dependencies.
 */

// [total codewords, ec codewords per block, blocks group1, data cw group1, blocks group2, data cw group2] for level M
const TABLE: Record<number, [number, number, number, number, number, number]> = {
  1: [26, 10, 1, 16, 0, 0], 2: [44, 16, 1, 28, 0, 0], 3: [70, 26, 1, 44, 0, 0], 4: [100, 18, 2, 32, 0, 0],
  5: [134, 24, 2, 43, 0, 0], 6: [172, 16, 4, 27, 0, 0], 7: [196, 18, 4, 31, 0, 0], 8: [242, 22, 2, 38, 2, 39],
  9: [292, 22, 3, 36, 2, 37], 10: [346, 26, 4, 43, 1, 44],
}
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] }

// GF(256) with polynomial 0x11d
const EXP = new Array<number>(512)
const LOG = new Array<number>(256)
;(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] })()
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

function rsGenerator(degree: number) {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= mul(poly[j], EXP[i]) }
    poly = next
  }
  return poly
}
function rsEncode(data: number[], degree: number) {
  const gen = rsGenerator(degree)
  const res = new Array(degree).fill(0)
  for (const d of data) {
    const factor = d ^ res.shift()!
    res.push(0)
    for (let i = 0; i < degree; i++) res[i] ^= mul(gen[i + 1], factor)
  }
  return res
}

function encodeData(bytes: number[], version: number) {
  const [, , b1, d1, b2, d2] = TABLE[version]
  const capacity = b1 * d1 + b2 * d2
  const bits: number[] = []
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1) }
  put(0b0100, 4)
  put(bytes.length, version < 10 ? 8 : 16)
  for (const b of bytes) put(b, 8)
  put(0, Math.min(4, capacity * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const out: number[] = []
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2))
  for (let pad = 0; out.length < capacity; pad++) out.push(pad % 2 ? 0x11 : 0xec)
  return out
}

function interleave(data: number[], version: number) {
  const [, ec, b1, d1, b2, d2] = TABLE[version]
  const blocks: number[][] = []
  let k = 0
  for (let i = 0; i < b1; i++) { blocks.push(data.slice(k, k + d1)); k += d1 }
  for (let i = 0; i < b2; i++) { blocks.push(data.slice(k, k + d2)); k += d2 }
  const ecBlocks = blocks.map((b) => rsEncode(b, ec))
  const out: number[] = []
  const maxD = Math.max(d1, d2)
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) out.push(b[i])
  for (let i = 0; i < ec; i++) for (const b of ecBlocks) out.push(b[i])
  return out
}

type Grid = { size: number; m: number[][]; fn: boolean[][] }

function baseGrid(version: number): Grid {
  const size = version * 4 + 17
  const m = Array.from({ length: size }, () => new Array(size).fill(0))
  const fn = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (r: number, c: number, v: number) => { if (r >= 0 && c >= 0 && r < size && c < size) { m[r][c] = v; fn[r][c] = true } }
  const finder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
      set(r + dr, c + dc, on ? 1 : 0)
    }
  }
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0)
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0) }
  const pos = ALIGN[version]
  for (const r of pos) for (const c of pos) {
    if ((r === 6 && c === 6) || (r === 6 && c === pos[pos.length - 1]) || (r === pos[pos.length - 1] && c === 6)) continue
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0)
  }
  // reserve format areas + dark module
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, 0); if (!fn[i][8]) set(i, 8, 0) }
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, 0); set(size - 1 - i, 8, 0) }
  set(size - 8, 8, 1)
  // version info (v7+)
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i) & 1
      const a = size - 11 + (i % 3), b = Math.floor(i / 3)
      set(a, b, bit); set(b, a, bit)
    }
  }
  return { size, m, fn }
}

function placeData(g: Grid, codewords: number[]) {
  const bits: number[] = []
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1)
  let i = 0
  let upward = true
  for (let col = g.size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let k = 0; k < g.size; k++) {
      const row = upward ? g.size - 1 - k : k
      for (const c of [col, col - 1]) if (!g.fn[row][c]) { g.m[row][c] = i < bits.length ? bits[i] : 0; i++ }
    }
    upward = !upward
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function withMask(g: Grid, mask: number) {
  const m = g.m.map((row) => row.slice())
  for (let r = 0; r < g.size; r++) for (let c = 0; c < g.size; c++) if (!g.fn[r][c] && MASKS[mask](r, c)) m[r][c] ^= 1
  // format info: level M = 00
  const data = (0b00 << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412
  const s = g.size
  for (let i = 0; i <= 5; i++) m[i][8] = (bits >>> i) & 1
  m[7][8] = (bits >>> 6) & 1; m[8][8] = (bits >>> 7) & 1; m[8][7] = (bits >>> 8) & 1
  for (let i = 9; i < 15; i++) m[8][14 - i] = (bits >>> i) & 1
  for (let i = 0; i < 8; i++) m[8][s - 1 - i] = (bits >>> i) & 1
  for (let i = 8; i < 15; i++) m[s - 15 + i][8] = (bits >>> i) & 1
  m[s - 8][8] = 1
  return m
}

function penalty(m: number[][]) {
  const n = m.length
  let p = 0
  for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) {
    let run = 1
    for (let b = 1; b < n; b++) {
      const cur = pass ? m[b][a] : m[a][b], prev = pass ? m[b - 1][a] : m[a][b - 1]
      if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1
    }
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3 }
  const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], rev = pat.slice().reverse()
  for (let r = 0; r < n; r++) for (let c = 0; c <= n - 11; c++) for (const pt of [pat, rev]) {
    if (pt.every((v, i) => m[r][c + i] === v)) p += 40
    if (pt.every((v, i) => m[c + i][r] === v)) p += 40
  }
  let dark = 0
  for (const row of m) for (const v of row) dark += v
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10
  return p
}

/** Returns the module matrix (1 = dark). */
export function qrMatrix(text: string): number[][] {
  const bytes = Array.from(new TextEncoder().encode(text))
  let version = 1
  while (version <= 10) { const [, , b1, d1, b2, d2] = TABLE[version]; if (bytes.length + 2 + (version >= 10 ? 1 : 0) <= b1 * d1 + b2 * d2) break; version++ }
  if (version > 10) throw new Error("Text too long for QR")
  const g = baseGrid(version)
  placeData(g, interleave(encodeData(bytes, version), version))
  let best: number[][] | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) { const m = withMask(g, mask); const s = penalty(m); if (s < bestScore) { bestScore = s; best = m } }
  return best!
}

export function qrSvg(text: string, { color = "#000", background = "#fff", margin = 4 } = {}) {
  const m = qrMatrix(text)
  const n = m.length + margin * 2
  let d = ""
  m.forEach((row, r) => row.forEach((v, c) => { if (v) d += `M${c + margin} ${r + margin}h1v1h-1z` }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${background}"/><path d="${d}" fill="${color}"/></svg>`
}
