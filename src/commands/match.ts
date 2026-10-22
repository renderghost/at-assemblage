/**
 * Small fuzzy matcher for the command bar. Every word of the query must match
 * somewhere in an entry's fields; better matches (start of the text, start of
 * a word, a plain substring, then letters in order) score higher, and the
 * matched characters are returned so rows can highlight them.
 */

export type Range = [start: number, end: number]

export type Field = {
  key: string
  text: string | undefined
  /** How much a match here counts, 0–1 (a title is 1, a note maybe 0.5). */
  weight: number
  /** Allow letters-in-order matches ("rdgst" → "radioghost"); only sensible for short text. */
  fuzzy?: boolean
}

export type FieldsMatch = {
  /** 0–100. */
  score: number
  /** Matched character ranges per field key. */
  ranges: Record<string, Range[]>
  /** The field that contributed most, for choosing what to show as a snippet. */
  best: string
}

const SCORE = { prefix: 100, wordStart: 85, substring: 65, fuzzy: 40 } as const

/** Lower-cases and strips accents character by character, so indexes still line up with the original. */
export function fold(text: string): string {
  let out = ''
  for (const ch of text) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    // Keep the original length so ranges map back.
    out += base.length === ch.length ? base : ch
  }
  return out
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

/** Best match of one query token in one text, or null. */
export function matchToken(token: string, text: string, fuzzy = false): { score: number; ranges: Range[] } | null {
  if (!token) return { score: SCORE.prefix, ranges: [] }
  const hay = fold(text)
  const needle = fold(token)
  let at = hay.indexOf(needle)
  if (at === 0) return { score: SCORE.prefix, ranges: [[0, needle.length]] }
  // Prefer a match at the start of a word anywhere in the text.
  let first = -1
  while (at !== -1) {
    if (first === -1) first = at
    if (!isWordChar(hay[at - 1])) return { score: SCORE.wordStart - Math.min(at / 50, 10), ranges: [[at, at + needle.length]] }
    at = hay.indexOf(needle, at + 1)
  }
  if (first !== -1) return { score: SCORE.substring - Math.min(first / 20, 15), ranges: [[first, first + needle.length]] }
  if (!fuzzy || needle.length < 2) return null

  // Letters in order; consecutive runs and word starts score better, gaps worse.
  const ranges: Range[] = []
  let i = 0
  let gaps = 0
  let starts = 0
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] !== needle[i]) continue
    const last = ranges[ranges.length - 1]
    if (last && last[1] === j) last[1] = j + 1
    else {
      if (ranges.length) gaps++
      ranges.push([j, j + 1])
    }
    if (!isWordChar(hay[j - 1])) starts++
    i++
  }
  if (i < needle.length) return null
  const spread = ranges[ranges.length - 1]![1] - ranges[0]![0]
  if (spread > needle.length * 4) return null
  return { score: Math.max(10, SCORE.fuzzy - gaps * 6 + starts * 4), ranges }
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

export function tokenize(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

/**
 * Matches every token of `query` against an entry's fields. A token counts
 * where it scores best (score × weight). Null if any token matches nowhere.
 */
export function matchFields(query: string, fields: readonly Field[]): FieldsMatch | null {
  const tokens = tokenize(query)
  if (tokens.length === 0) return { score: 0, ranges: {}, best: fields[0]?.key ?? '' }
  const ranges: Record<string, Range[]> = {}
  const contribution: Record<string, number> = {}
  let total = 0
  for (const token of tokens) {
    let best: { key: string; value: number; ranges: Range[] } | null = null
    for (const field of fields) {
      if (!field.text) continue
      const m = matchToken(token, field.text, field.fuzzy)
      if (!m) continue
      const value = m.score * field.weight
      if (!best || value > best.value) best = { key: field.key, value, ranges: m.ranges }
    }
    if (!best) return null
    total += best.value
    ranges[best.key] = [...(ranges[best.key] ?? []), ...best.ranges]
    contribution[best.key] = (contribution[best.key] ?? 0) + best.value
  }
  for (const key of Object.keys(ranges)) ranges[key] = mergeRanges(ranges[key]!)
  const bestKey = Object.entries(contribution).sort((a, b) => b[1] - a[1])[0]![0]
  return { score: total / tokens.length, ranges, best: bestKey }
}

/**
 * A short excerpt of `text` around its first matched range, with the ranges
 * shifted to the excerpt. For showing why a note or description matched.
 */
export function snippet(text: string, ranges: readonly Range[], max = 90): { text: string; ranges: Range[] } {
  const flat = text.replace(/\s+/g, ' ')
  // Whitespace collapsing changes indexes; recompute against the flattened text.
  const shift = (i: number) => text.slice(0, i).replace(/\s+/g, ' ').length
  const mapped = ranges.map(([s, e]): Range => [shift(s), shift(e)])
  if (flat.length <= max) return { text: flat, ranges: mapped }
  const first = mapped[0]?.[0] ?? 0
  const start = Math.max(0, Math.min(first - Math.floor(max / 3), flat.length - max))
  const end = Math.min(flat.length, start + max)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < flat.length ? '…' : ''
  const offset = prefix.length - start
  return {
    text: prefix + flat.slice(start, end) + suffix,
    ranges: mapped
      .filter(([s, e]) => e > start && s < end)
      .map(([s, e]): Range => [Math.max(s, start) + offset, Math.min(e, end) + offset]),
  }
}
