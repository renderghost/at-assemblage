/**
 * What you've run or opened from the command bar, ranked by frecency: how
 * often, decayed by how long ago (half-life one week). Stored per browser;
 * keys look like `command:fit-view` or `card:at://…`.
 */

export type Use = { count: number; last: number }
export type Recents = Record<string, Use>

export const RECENTS_KEY = 'assemblage:command-recents:v1'
const MAX_KEPT = 60
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000

type Store = Pick<Storage, 'getItem' | 'setItem'>

function storage(store?: Store): Store | null {
  if (store) return store
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadRecents(store?: Store): Recents {
  try {
    const raw = JSON.parse(storage(store)?.getItem(RECENTS_KEY) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object') return {}
    const out: Recents = {}
    for (const [key, use] of Object.entries(raw as Record<string, Partial<Use>>)) {
      if (typeof use?.count === 'number' && typeof use.last === 'number') out[key] = { count: use.count, last: use.last }
    }
    return out
  } catch {
    return {}
  }
}

export function frecency(use: Use, now: number): number {
  return use.count * Math.pow(0.5, Math.max(0, now - use.last) / HALF_LIFE_MS)
}

/** Keys by frecency, best first. */
export function rankRecents(recents: Recents, now = Date.now()): string[] {
  return Object.entries(recents)
    .sort((a, b) => frecency(b[1], now) - frecency(a[1], now))
    .map(([key]) => key)
}

/** Records one use and keeps the best `MAX_KEPT`. */
export function recordUse(key: string, now = Date.now(), store?: Store): Recents {
  const recents = loadRecents(store)
  const prev = recents[key]
  recents[key] = { count: (prev?.count ?? 0) + 1, last: now }
  const kept = Object.fromEntries(rankRecents(recents, now).slice(0, MAX_KEPT).map((k) => [k, recents[k]!]))
  try {
    storage(store)?.setItem(RECENTS_KEY, JSON.stringify(kept))
  } catch {
    // Storage unavailable: recents just won't be remembered.
  }
  return kept
}
