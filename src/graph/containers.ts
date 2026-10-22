import type { Position, Positions } from './layout'
import type { GraphItem, GraphLink } from './model'

/**
 * Geometry for showing collections as containers. Card positions inside a
 * container are relative to its top-left corner; the container's own position
 * is absolute. Pure functions, so they're easy to test.
 */

export const HEADER_HEIGHT = 44
export const PADDING = 24
export const GROUP_GAP = 96
export const COLLAPSED_SIZE = { width: 280, height: 60 }
export const EMPTY_SIZE = { width: 320, height: HEADER_HEIGHT + 120 }
const CARD_GAP = 32
const SHELF_WIDTH = 2800

export type Size = { width: number; height: number }
export type Rect = Position & Size

/** Per collection, for one account: where its cards sit inside it, its size, and whether it's collapsed. */
export type CollectionLayout = { cards: Positions; size?: Size; collapsed?: boolean }

/** Per account and set of shown collections: where each container sits, and the cards outside any. */
export type ContainerLayout = { groups: Positions; floats: Positions }

/**
 * Each card goes in one container: the first shown collection it belongs to.
 * Cards outside the shown collections (or external ones) get no container.
 */
export function primaryGroups(items: readonly GraphItem[], shownGroupIds: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const item of items) {
    if (item.external) continue
    const group = shownGroupIds.find((g) => item.groupIds.includes(g))
    if (group) out.set(item.id, group)
  }
  return out
}

function bounds(rects: readonly Rect[]) {
  return {
    minX: Math.min(...rects.map((r) => r.x)),
    minY: Math.min(...rects.map((r) => r.y)),
    maxX: Math.max(...rects.map((r) => r.x + r.width)),
    maxY: Math.max(...rects.map((r) => r.y + r.height)),
  }
}

export type Wrapped = { origin: Position; size: Size; shift: Position }

/**
 * Makes a container wrap its cards, clearing the header and padding. Only
 * ever grows: if a card sits too far left or up, the container's origin moves
 * out and every card shifts by `shift` so nothing moves on screen.
 */
export function wrapChildren(origin: Position, size: Size | undefined, children: readonly Rect[]): Wrapped {
  const base = size ?? { width: 0, height: 0 }
  if (children.length === 0) {
    return { origin, size: { width: Math.max(base.width, EMPTY_SIZE.width), height: Math.max(base.height, EMPTY_SIZE.height) }, shift: { x: 0, y: 0 } }
  }
  const b = bounds(children)
  const dx = Math.max(0, PADDING - b.minX)
  const dy = Math.max(0, HEADER_HEIGHT + PADDING - b.minY)
  return {
    origin: { x: origin.x - dx, y: origin.y - dy },
    size: {
      width: Math.max(base.width + dx, b.maxX + dx + PADDING, EMPTY_SIZE.width),
      height: Math.max(base.height + dy, b.maxY + dy + PADDING),
    },
    shift: { x: dx, y: dy },
  }
}

/** "Fit to cards": wrap the cards exactly, with padding on every side (may shrink). */
export function fitChildren(origin: Position, children: readonly Rect[]): Wrapped {
  if (children.length === 0) return { origin, size: { ...EMPTY_SIZE }, shift: { x: 0, y: 0 } }
  const b = bounds(children)
  const dx = PADDING - b.minX
  const dy = HEADER_HEIGHT + PADDING - b.minY
  return {
    origin: { x: origin.x - dx, y: origin.y - dy },
    size: { width: Math.max(b.maxX - b.minX + 2 * PADDING, EMPTY_SIZE.width), height: b.maxY - b.minY + HEADER_HEIGHT + 2 * PADDING },
    shift: { x: dx, y: dy },
  }
}

/** Positions for cards newly added to a container: rows of three below the existing cards. */
export function placeNewCards(existing: readonly Rect[], count: number, card: Size): Position[] {
  const top = existing.length ? bounds(existing).maxY + CARD_GAP : HEADER_HEIGHT + PADDING
  return Array.from({ length: count }, (_, i) => ({
    x: PADDING + (i % 3) * (card.width + CARD_GAP),
    y: top + Math.floor(i / 3) * (card.height + CARD_GAP),
  }))
}

function overlaps(a: Rect, b: Rect, gap = 0) {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap
}

/**
 * Finds a free spot for each new container: shelves to the right of (or,
 * with nothing placed yet, starting at) the existing ones, wrapping into new
 * rows so the canvas doesn't become one long strip.
 */
export function packGroups(placed: readonly Rect[], toPlace: readonly { id: string; size: Size }[]): Positions {
  const out: Positions = {}
  const taken = [...placed]
  const startX = taken.length ? Math.max(...taken.map((r) => r.x + r.width)) + GROUP_GAP : 0
  let x = startX
  let y = taken.length ? Math.min(...taken.map((r) => r.y)) : 0
  let shelfBottom = y
  for (const { id, size } of toPlace) {
    if (x > startX && x + size.width > startX + SHELF_WIDTH) {
      x = startX
      y = shelfBottom + GROUP_GAP
    }
    let rect = { x, y, ...size }
    while (taken.some((t) => overlaps(rect, t, GROUP_GAP / 2))) rect = { ...rect, y: rect.y + GROUP_GAP }
    out[id] = { x: rect.x, y: rect.y }
    taken.push(rect)
    x = rect.x + size.width + GROUP_GAP
    shelfBottom = Math.max(shelfBottom, rect.y + size.height)
  }
  return out
}

/** True if a rect overlaps any of the others (with a small gap). */
export function collides(rect: Rect, others: readonly Rect[]): boolean {
  return others.some((o) => overlaps(rect, o, GROUP_GAP / 2))
}

export type Rollup = { id: string; sourceId: string; targetId: string; linkIds: string[]; types: string[] }

/**
 * For collapsed collections: connections to their hidden cards are redrawn to
 * the collection node, one edge per pair of ends and direction, with a count.
 * Connections between two cards of the same collapsed collection disappear.
 */
export function rollupLinks(
  links: readonly GraphLink[],
  hiddenIn: ReadonlyMap<string, string>,
): { links: GraphLink[]; rollups: Rollup[] } {
  const kept: GraphLink[] = []
  const byPair = new Map<string, Rollup>()
  for (const link of links) {
    const source = hiddenIn.get(link.sourceId) ?? link.sourceId
    const target = hiddenIn.get(link.targetId) ?? link.targetId
    if (source === link.sourceId && target === link.targetId) {
      kept.push(link)
      continue
    }
    if (source === target) continue
    const id = `rollup:${source}->${target}`
    const rollup = byPair.get(id) ?? { id, sourceId: source, targetId: target, linkIds: [], types: [] }
    rollup.linkIds.push(link.id)
    const type = link.type?.trim().toUpperCase() ?? ''
    if (!rollup.types.includes(type)) rollup.types.push(type)
    byPair.set(id, rollup)
  }
  return { links: kept, rollups: [...byPair.values()] }
}
