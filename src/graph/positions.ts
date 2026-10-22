import type { CollectionLayout, ContainerLayout } from './containers'
import type { Positions } from './layout'

/**
 * Manual node positions are presentation state only. They live in this
 * browser, keyed by DID and the exact set of selected collections, and are
 * never written to the PDS.
 */
export function layoutStorageKey(did: string, groupIds: readonly string[]): string {
  return `assemblage:layout:v1:${did}:${[...groupIds].sort().join('|')}`
}

export function loadPositions(key: string): Positions {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Positions = {}
    for (const [id, pos] of Object.entries(parsed as Record<string, unknown>)) {
      const p = pos as { x?: unknown; y?: unknown }
      if (typeof p?.x === 'number' && typeof p?.y === 'number') out[id] = { x: p.x, y: p.y }
    }
    return out
  } catch {
    return {}
  }
}

export function savePositions(key: string, positions: Positions): void {
  try {
    localStorage.setItem(key, JSON.stringify(positions))
  } catch {
    // Storage unavailable: positions still hold for this session.
  }
}

const selectionKey = (did: string) => `assemblage:selection:v1:${did}`

export function loadSelectedGroups(did: string): string[] {
  try {
    const raw = localStorage.getItem(selectionKey(did))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function saveSelectedGroups(did: string, ids: readonly string[]): void {
  try {
    localStorage.setItem(selectionKey(did), JSON.stringify(ids))
  } catch {
    // ignore
  }
}

// ——— Containers (collections shown as boxes) ———

function readPositions(value: unknown): Positions {
  const out: Positions = {}
  if (!value || typeof value !== 'object') return out
  for (const [id, pos] of Object.entries(value as Record<string, unknown>)) {
    const p = pos as { x?: unknown; y?: unknown }
    if (typeof p?.x === 'number' && typeof p?.y === 'number') out[id] = { x: p.x, y: p.y }
  }
  return out
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: the layout still holds for this session.
  }
}

/** Where containers (and cards outside any) sit, for one account and set of shown collections. */
export function containerLayoutKey(did: string, groupIds: readonly string[]): string {
  return `assemblage:containers:v1:${did}:${[...groupIds].sort().join('|')}`
}

export function loadContainerLayout(key: string): ContainerLayout {
  const raw = readJson(key) as { groups?: unknown; floats?: unknown } | null
  return { groups: readPositions(raw?.groups), floats: readPositions(raw?.floats) }
}

export function saveContainerLayout(key: string, layout: ContainerLayout) {
  writeJson(key, layout)
}

/**
 * A collection's own layout (card positions inside it, size, collapsed),
 * per account. Independent of which other collections are shown.
 */
const collectionKey = (did: string, groupId: string) => `assemblage:collection-layout:v1:${did}:${groupId}`

export function loadCollectionLayout(did: string, groupId: string): CollectionLayout | undefined {
  const raw = readJson(collectionKey(did, groupId)) as { cards?: unknown; size?: { width?: unknown; height?: unknown }; collapsed?: unknown } | null
  if (!raw) return undefined
  const size =
    typeof raw.size?.width === 'number' && typeof raw.size?.height === 'number'
      ? { width: raw.size.width, height: raw.size.height }
      : undefined
  return { cards: readPositions(raw.cards), ...(size ? { size } : {}), ...(raw.collapsed === true ? { collapsed: true } : {}) }
}

export function saveCollectionLayout(did: string, groupId: string, layout: CollectionLayout) {
  writeJson(collectionKey(did, groupId), layout)
}

export function removeCollectionLayout(did: string, groupId: string) {
  try {
    localStorage.removeItem(collectionKey(did, groupId))
  } catch {
    // ignore
  }
}
