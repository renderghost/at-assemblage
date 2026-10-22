import { applyNodeChanges, useReactFlow, type NodeChange } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import {
  collides,
  COLLAPSED_SIZE,
  fitChildren,
  GROUP_GAP,
  HEADER_HEIGHT,
  packGroups,
  PADDING,
  placeNewCards,
  primaryGroups,
  wrapChildren,
  type CollectionLayout,
  type Rect,
  type Size,
} from '../../graph/containers'
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH, type Positions } from '../../graph/layout'
import type { GraphItem } from '../../graph/model'
import {
  containerLayoutKey,
  layoutStorageKey,
  loadCollectionLayout,
  loadContainerLayout,
  loadPositions,
} from '../../graph/positions'
import { FOCUS_PADDING, fitPadding } from '../../graph/viewport'
import { motion } from '../../preferences/appearance'
import { useUiStore } from '../../state/uiStore'
import { cardNode, type AppNode } from './canvasNodes'
import type { CollectionNodeType } from './CollectionNode'
import { useWorkspace } from './WorkspaceContext'

/** Until a card has been measured, assume a typical card height (taller than most). */
const CARD_ESTIMATE: Size = { width: NODE_WIDTH, height: 90 }

const samePos = (a?: { x: number; y: number }, b?: { x: number; y: number }) =>
  !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5

function samePositions(a: Positions, b: Positions) {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => samePos(a[k], b[k]))
}

function sameLayout(a: CollectionLayout | undefined, b: CollectionLayout) {
  if (!a) return false
  const sizeSame =
    (!a.size && !b.size) ||
    (!!a.size && !!b.size && Math.abs(a.size.width - b.size.width) < 0.5 && Math.abs(a.size.height - b.size.height) < 0.5)
  return sizeSame && !!a.collapsed === !!b.collapsed && samePositions(a.cards, b.cards)
}

/** Shift positions so the top-left one sits just inside a container, below its header. */
function intoContainer(abs: Positions): { cards: Positions; min: { x: number; y: number } } {
  const ps = Object.values(abs)
  const min = { x: Math.min(...ps.map((p) => p.x)), y: Math.min(...ps.map((p) => p.y)) }
  const cards: Positions = {}
  for (const [id, p] of Object.entries(abs)) cards[id] = { x: p.x - min.x + PADDING, y: p.y - min.y + HEADER_HEIGHT + PADDING }
  return { cards, min }
}

/**
 * Container presentation: each shown collection is a box (or, collapsed, a
 * single node) and its cards are children positioned relative to it. A card
 * sits in its primary collection: the first shown one it belongs to.
 *
 * Saved per account: each collection's inner layout (independent of which
 * other collections are shown) and, per set of shown collections, where each
 * box sits plus the cards outside any box.
 */
export function useContainerLayout(enabled: boolean) {
  const { did } = useAuth()
  const { data, visible, activeGroupIds, groups, annotationsByItem, groupNames } = useWorkspace()
  const { fitView, getNodes } = useReactFlow<AppNode>()
  const filters = useUiStore((s) => s.filters)
  const scope = useUiStore((s) => s.containerScope)
  const containerLayout = useUiStore((s) => s.containerLayout)
  const collectionLayouts = useUiStore((s) => s.collectionLayouts)
  const fitRequest = useUiStore((s) => s.fitCollectionRequest)
  const selectionRequest = useUiStore((s) => s.selectionRequest)

  const key = containerLayoutKey(did, activeGroupIds)
  const ready = enabled && scope?.key === key && scope.did === did
  // The collection filter narrows which boxes are shown.
  const shownGroupIds = useMemo(
    () => (filters.groupIds.length ? activeGroupIds.filter((g) => filters.groupIds.includes(g)) : activeGroupIds),
    [activeGroupIds, filters.groupIds],
  )
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const groupIdSet = useMemo(() => new Set(groups.map((g) => g.id)), [groups])
  const primary = useMemo(() => primaryGroups(data.items, shownGroupIds), [data.items, shownGroupIds])
  const membersByGroup = useMemo(() => {
    const out = new Map<string, GraphItem[]>()
    for (const item of data.items) {
      const g = primary.get(item.id)
      if (g) out.set(g, [...(out.get(g) ?? []), item])
    }
    return out
  }, [data.items, primary])

  // Measured card sizes, so boxes wrap their real cards.
  const [sizes, setSizes] = useState<Record<string, Size>>({})
  const sizeOf = useCallback((id: string): Size => sizes[id] ?? CARD_ESTIMATE, [sizes])
  const noteSizes = useCallback((changes: NodeChange<AppNode>[], groupIds: ReadonlySet<string>) => {
    const updates: Record<string, Size> = {}
    for (const c of changes) {
      // Only cards' measured sizes; resizer changes (resizing set) are a container's own size.
      if (c.type !== 'dimensions' || !c.dimensions || c.setAttributes || c.resizing !== undefined || groupIds.has(c.id)) continue
      updates[c.id] = { width: c.dimensions.width, height: c.dimensions.height }
    }
    if (Object.keys(updates).length === 0) return
    setSizes((prev) => {
      const changed = Object.entries(updates).filter(
        ([id, s]) => !prev[id] || Math.abs(prev[id]!.width - s.width) > 1 || Math.abs(prev[id]!.height - s.height) > 1,
      )
      return changed.length ? { ...prev, ...Object.fromEntries(changed) } : prev
    })
  }, [])

  // 1. Load this account's layouts for the shown collections.
  useEffect(() => {
    if (!enabled) return
    const collections = Object.fromEntries(
      activeGroupIds.flatMap((g) => {
        const layout = loadCollectionLayout(did, g)
        return layout ? [[g, layout] as const] : []
      }),
    )
    useUiStore.getState().loadContainers({ did, key }, loadContainerLayout(key), collections)
    // activeGroupIds is encoded in key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, did, key])

  const estimatedSize = useCallback(
    (layout: CollectionLayout | undefined): Size => {
      if (layout?.collapsed) return COLLAPSED_SIZE
      const rects = Object.entries(layout?.cards ?? {}).map(([id, p]) => ({ ...p, ...sizeOf(id) }))
      return wrapChildren({ x: 0, y: 0 }, layout?.size, rects).size
    },
    [sizeOf],
  )

  // 2. Give every shown collection, card and outside card a position.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const run = async () => {
      const { containerLayout: current, collectionLayouts: layouts, pendingPlacements } = useUiStore.getState()
      const updates: Record<string, CollectionLayout> = {}
      const flat = loadPositions(layoutStorageKey(did, activeGroupIds))
      const flatOrigins: Positions = {}
      const usedPlacements: string[] = []

      for (const g of shownGroupIds) {
        const members = membersByGroup.get(g) ?? []
        const layout = layouts[g]
        const missing = members.filter((m) => !layout?.cards[m.id])
        if (layout && missing.length === 0) continue
        const isNew = !layout || Object.keys(layout.cards).length === 0
        if (isNew && members.length > 0) {
          // First time as a container: keep the arrangement the cards had on the flat canvas, if any.
          const fromFlat = Object.fromEntries(members.flatMap((m) => (flat[m.id] ? [[m.id, flat[m.id]!]] : [])))
          let abs: Positions
          if (Object.keys(fromFlat).length === members.length) {
            abs = fromFlat
          } else {
            const ids = new Set(members.map((m) => m.id))
            abs = await layoutGraph(members, data.links.filter((l) => ids.has(l.sourceId) && ids.has(l.targetId)))
            if (cancelled) return
          }
          const { cards, min } = intoContainer(abs)
          if (abs === fromFlat) flatOrigins[g] = { x: min.x - PADDING, y: min.y - HEADER_HEIGHT - PADDING }
          updates[g] = { ...(layout ?? {}), cards }
        } else {
          // Newly added cards: where the user right-clicked, else in rows below the others.
          const cards: Positions = { ...(layout?.cards ?? {}) }
          const origin = current.groups[g]
          const boxSize = estimatedSize(layout)
          const inBox = (p: { x: number; y: number }) =>
            !!origin && p.x >= origin.x && p.y >= origin.y && p.x <= origin.x + boxSize.width && p.y <= origin.y + boxSize.height
          const rest: GraphItem[] = []
          for (const m of missing) {
            // Use the right-clicked spot only if it's inside this box; otherwise the box would stretch to reach it.
            const at = pendingPlacements[m.id]
            if (at && origin && inBox(at)) {
              cards[m.id] = { x: at.x - origin.x, y: at.y - origin.y }
              usedPlacements.push(m.id)
            } else {
              if (at) usedPlacements.push(m.id)
              rest.push(m)
            }
          }
          const existing: Rect[] = Object.entries(cards).map(([id, p]) => ({ ...p, ...sizeOf(id) }))
          placeNewCards(existing, rest.length, { width: NODE_WIDTH, height: NODE_HEIGHT }).forEach((p, i) => {
            cards[rest[i]!.id] = p
          })
          updates[g] = { ...(layout ?? {}), cards }
        }
      }

      // Boxes that need a spot: their old flat spot if free, otherwise packed beside the others.
      const groupPositions = { ...current.groups }
      const sizeFor = (g: string) => estimatedSize(updates[g] ?? layouts[g])
      const placed: Rect[] = shownGroupIds.filter((g) => groupPositions[g]).map((g) => ({ ...groupPositions[g]!, ...sizeFor(g) }))
      const toPack: { id: string; size: Size }[] = []
      for (const g of shownGroupIds) {
        if (groupPositions[g]) continue
        const origin = flatOrigins[g]
        const rect = origin ? { ...origin, ...sizeFor(g) } : null
        if (rect && !collides(rect, placed)) {
          groupPositions[g] = origin!
          placed.push(rect)
        } else toPack.push({ id: g, size: sizeFor(g) })
      }
      Object.assign(groupPositions, packGroups(placed, toPack))

      // Cards outside any box (e.g. outside cards that connections reach).
      const floats = { ...current.floats }
      const allRects = shownGroupIds.map((g) => ({ ...groupPositions[g]!, ...sizeFor(g) }))
      let nextY = 0
      const right = allRects.length ? Math.max(...allRects.map((r) => r.x + r.width)) + GROUP_GAP : 0
      for (const item of data.items) {
        if (primary.has(item.id) || floats[item.id]) continue
        const at = pendingPlacements[item.id]
        if (at) {
          floats[item.id] = at
          usedPlacements.push(item.id)
        } else {
          floats[item.id] = { x: right, y: nextY }
          nextY += NODE_HEIGHT + 32
        }
      }

      if (cancelled) return
      const store = useUiStore.getState()
      if (Object.keys(updates).length) store.setCollectionLayouts(updates)
      if (!samePositions(groupPositions, current.groups) || !samePositions(floats, current.floats)) {
        store.setContainerLayout({ groups: groupPositions, floats })
      }
      if (usedPlacements.length) {
        useUiStore.setState((s) => ({
          pendingPlacements: Object.fromEntries(Object.entries(s.pendingPlacements).filter(([id]) => !usedPlacements.includes(id))),
        }))
      }
      // First appearance: fit everything; a just-added card that wants focus: zoom to it.
      const placedIds = new Set(Object.values(updates).flatMap((u) => Object.keys(u.cards)))
      const request = store.selectionRequest
      const wanted = request?.focus ? request.nodes.filter((id) => placedIds.has(id) && !usedPlacements.includes(id)) : []
      if (wanted.length) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => fitView({ nodes: wanted.map((id) => ({ id })), padding: FOCUS_PADDING, duration: motion(400), maxZoom: 1.1 })),
        )
      } else if (Object.keys(current.groups).length === 0 && toPack.length + Object.keys(flatOrigins).length > 0) {
        requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding: fitPadding(false), duration: motion(300) })))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [ready, did, activeGroupIds, shownGroupIds, membersByGroup, primary, data.items, data.links, collectionLayouts, containerLayout, estimatedSize, sizeOf, fitView])

  // 3. Build the nodes: boxes first (React Flow needs parents before children), then their cards, then the rest.
  const { nodes, hiddenIn } = useMemo(() => {
    const hiddenIn = new Map<string, string>()
    if (!ready) return { nodes: [] as AppNode[], hiddenIn }
    const boxes: AppNode[] = []
    const children: AppNode[] = []
    const floating: AppNode[] = []
    const rendered = new Set<string>()
    const badgesFor = (item: GraphItem, home?: string) =>
      item.groupIds.filter((id) => id !== home && shownGroupIds.includes(id)).map((id) => ({ id, name: groupNames.get(id) ?? 'Collection' }))

    for (const g of shownGroupIds) {
      const origin = containerLayout.groups[g]
      const layout = collectionLayouts[g]
      const group = groupById.get(g)
      if (!origin || !layout || !group) continue
      rendered.add(g)
      const members = (membersByGroup.get(g) ?? []).filter((m) => layout.cards[m.id] && visible.itemIds.has(m.id))
      const collapsed = !!layout.collapsed
      const wrapped = wrapChildren(
        origin,
        layout.size,
        members.map((m) => ({ ...layout.cards[m.id]!, ...sizeOf(m.id) })),
      )
      const box: CollectionNodeType = {
        id: g,
        type: 'collection',
        position: collapsed ? origin : wrapped.origin,
        ...(collapsed ? COLLAPSED_SIZE : wrapped.size),
        ...(collapsed ? {} : { dragHandle: '.collection-drag-handle' }),
        ariaLabel: `Collection: ${group.name}${collapsed ? ' (collapsed)' : ''}`,
        data: { group, count: members.length, collapsed },
      }
      boxes.push(box)
      for (const m of members) {
        if (collapsed) hiddenIn.set(m.id, g)
        const p = layout.cards[m.id]!
        children.push(
          cardNode(
            m,
            collapsed ? p : { x: p.x + wrapped.shift.x, y: p.y + wrapped.shift.y },
            { annotations: annotationsByItem, badges: badgesFor(m, g) },
            { parentId: g, expandParent: true, hidden: collapsed },
          ),
        )
      }
    }
    for (const item of data.items) {
      if (!visible.itemIds.has(item.id)) continue
      const home = primary.get(item.id)
      if (home) continue // in a box (or its box isn't laid out yet)
      const at = containerLayout.floats[item.id]
      if (at) floating.push(cardNode(item, at, { annotations: annotationsByItem, badges: badgesFor(item) }))
    }
    return { nodes: [...boxes, ...children, ...floating], hiddenIn }
  }, [ready, shownGroupIds, containerLayout, collectionLayouts, groupById, membersByGroup, visible.itemIds, sizeOf, annotationsByItem, groupNames, data.items, primary])

  // 4. Save what React Flow ended up with once a drag, resize or keyboard move finishes.
  const commit = useCallback(
    (next: AppNode[]) => {
      if (!ready || next.some((n) => n.dragging || n.resizing)) return
      const { containerLayout: current, collectionLayouts: layouts } = useUiStore.getState()
      const groupPositions = { ...current.groups }
      const floats = { ...current.floats }
      const updates: Record<string, CollectionLayout> = {}
      for (const n of next) {
        if (n.type === 'collection') {
          if (n.data.collapsed) {
            groupPositions[n.id] = n.position
            continue
          }
          const kids = next.filter((k) => k.parentId === n.id && !k.hidden)
          const size = { width: n.width ?? n.measured?.width ?? 0, height: n.height ?? n.measured?.height ?? 0 }
          const w = wrapChildren(
            n.position,
            size,
            kids.map((k) => ({ ...k.position, width: k.measured?.width ?? sizeOf(k.id).width, height: k.measured?.height ?? sizeOf(k.id).height })),
          )
          groupPositions[n.id] = w.origin
          const layout = layouts[n.id] ?? { cards: {} }
          const cards = { ...layout.cards }
          for (const k of kids) cards[k.id] = { x: k.position.x + w.shift.x, y: k.position.y + w.shift.y }
          const updated = { ...layout, cards, size: w.size }
          if (!sameLayout(layouts[n.id], updated)) updates[n.id] = updated
        } else if (!n.parentId) {
          floats[n.id] = n.position
        }
      }
      const store = useUiStore.getState()
      if (Object.keys(updates).length) store.setCollectionLayouts(updates)
      if (!samePositions(groupPositions, current.groups) || !samePositions(floats, current.floats)) {
        store.setContainerLayout({ groups: groupPositions, floats })
      }
    },
    [ready, sizeOf],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<AppNode>[], current: AppNode[]) => {
      noteSizes(changes, groupIdSet)
      // A move ends with dragging: false; a resize ends with resizing: false (and no setAttributes).
      const ended = changes.some((c) => (c.type === 'position' && !c.dragging) || (c.type === 'dimensions' && c.resizing === false))
      if (ended) commit(applyNodeChanges(changes, current))
    },
    [noteSizes, commit, groupIdSet],
  )

  // "Fit to cards" (from the menu or inspector): uses the cards' measured sizes.
  useEffect(() => {
    if (!fitRequest || !ready) return
    const all = getNodes()
    const box = all.find((n) => n.id === fitRequest.id)
    const layout = useUiStore.getState().collectionLayouts[fitRequest.id]
    if (!box || box.type !== 'collection' || box.data.collapsed || !layout) return
    const kids = all.filter((k) => k.parentId === box.id && !k.hidden)
    const f = fitChildren(
      box.position,
      kids.map((k) => ({ ...k.position, width: k.measured?.width ?? NODE_WIDTH, height: k.measured?.height ?? CARD_ESTIMATE.height })),
    )
    const cards = { ...layout.cards }
    for (const k of kids) cards[k.id] = { x: k.position.x + f.shift.x, y: k.position.y + f.shift.y }
    const store = useUiStore.getState()
    store.setCollectionLayouts({ [box.id]: { ...layout, cards, size: f.size } })
    store.setContainerLayout({ ...store.containerLayout, groups: { ...store.containerLayout.groups, [box.id]: f.origin } })
    // Only when a new request arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest?.nonce])

  // Selecting a card inside a collapsed collection (e.g. from the inspector) expands it.
  useEffect(() => {
    if (!ready || !selectionRequest) return
    for (const id of selectionRequest.nodes) {
      const g = primary.get(id)
      if (g && useUiStore.getState().collectionLayouts[g]?.collapsed) useUiStore.getState().toggleCollapsed(g, false)
    }
    // Only when a new request arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionRequest?.nonce])

  return { nodes, hiddenIn, onNodesChange }
}
