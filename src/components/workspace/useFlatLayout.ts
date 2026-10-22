import { useReactFlow, type NodeChange } from '@xyflow/react'
import { useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { layoutGraph, NODE_HEIGHT, type Positions } from '../../graph/layout'
import { layoutStorageKey, loadPositions, savePositions } from '../../graph/positions'
import { FOCUS_PADDING, fitPadding } from '../../graph/viewport'
import { useUiStore } from '../../state/uiStore'
import type { CardNodeType } from './CardNode'
import { cardNode, type AppNode } from './canvasNodes'
import { useWorkspace } from './WorkspaceContext'

/** Places new nodes below everything already positioned so manual layouts are never disturbed. */
function offsetBelow(existing: Positions, fresh: Positions): Positions {
  const ys = Object.values(existing).map((p) => p.y)
  const xs = Object.values(existing).map((p) => p.x)
  if (ys.length === 0) return fresh
  const top = Math.max(...ys) + NODE_HEIGHT + 80
  const left = Math.min(...xs)
  const out: Positions = {}
  for (const [id, p] of Object.entries(fresh)) out[id] = { x: p.x + left, y: p.y + top }
  return out
}

/**
 * Flat presentation: every card is a top-level node at an absolute position,
 * saved per account and set of shown collections.
 */
export function useFlatLayout(enabled: boolean) {
  const { did } = useAuth()
  const { data, visible, activeGroupIds, groupNames, annotationsByItem } = useWorkspace()
  const { fitView, getNode } = useReactFlow<AppNode>()
  const layoutKey = useUiStore((s) => s.layoutKey)
  const positions = useUiStore((s) => s.positions)
  const storageKey = layoutStorageKey(did, activeGroupIds)

  // 1. Load saved positions for this DID + collection set.
  useEffect(() => {
    if (enabled) useUiStore.getState().loadLayout(storageKey, loadPositions(storageKey))
  }, [enabled, storageKey])

  // 2. Lay out any visible items that have no position yet (first load, or new cards).
  const missing = useMemo(
    () => (enabled && layoutKey === storageKey ? data.items.filter((i) => !positions[i.id]) : []),
    [enabled, layoutKey, storageKey, data.items, positions],
  )
  useEffect(() => {
    if (missing.length === 0) return
    // Cards placed explicitly (e.g. created from the context menu) skip auto-layout.
    const { pendingPlacements } = useUiStore.getState()
    const placed = Object.fromEntries(missing.flatMap((i) => (pendingPlacements[i.id] ? [[i.id, pendingPlacements[i.id]!]] : [])))
    if (Object.keys(placed).length) {
      const { positions: current, mergePositions } = useUiStore.getState()
      mergePositions(placed)
      savePositions(storageKey, { ...current, ...placed })
      useUiStore.setState((s) => ({
        pendingPlacements: Object.fromEntries(Object.entries(s.pendingPlacements).filter(([id]) => !placed[id])),
      }))
      return
    }
    let cancelled = false
    const ids = new Set(missing.map((i) => i.id))
    const links = data.links.filter((l) => ids.has(l.sourceId) && ids.has(l.targetId))
    layoutGraph(missing, links).then((fresh) => {
      if (cancelled) return
      const { positions: current, mergePositions } = useUiStore.getState()
      const placed = offsetBelow(current, fresh)
      mergePositions(placed)
      savePositions(storageKey, { ...current, ...placed })
      // A just-added card is requested for selection before it has a position: focus it now.
      const requested = useUiStore.getState().selectionRequest?.nodes.filter((id) => placed[id]) ?? []
      if (requested.length) {
        requestAnimationFrame(() =>
          fitView({ nodes: requested.map((id) => ({ id })), padding: FOCUS_PADDING, duration: 400, maxZoom: 1.1 }),
        )
      } else if (Object.keys(current).length === 0) {
        requestAnimationFrame(() => fitView({ padding: fitPadding(false), duration: 300 }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [missing, data.links, storageKey, fitView])

  const nodes: CardNodeType[] = useMemo(() => {
    if (!enabled) return []
    const multi = activeGroupIds.length > 1
    return data.items
      .filter((i) => visible.itemIds.has(i.id) && positions[i.id])
      .map((item) =>
        cardNode(item, positions[item.id]!, {
          annotations: annotationsByItem,
          badges: multi ? item.groupIds.map((id) => ({ id, name: groupNames.get(id) ?? 'Collection' })) : [],
        }),
      )
  }, [enabled, data.items, visible.itemIds, positions, annotationsByItem, groupNames, activeGroupIds.length])

  // Persist positions when a move completes (mouse drag end or keyboard arrow move).
  const commit = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      let moved = false
      for (const c of changes) {
        if (c.type !== 'position' || c.dragging) continue
        const position = c.position ?? getNode(c.id)?.position
        if (position) {
          useUiStore.getState().movePosition(c.id, position)
          moved = true
        }
      }
      if (moved) savePositions(storageKey, useUiStore.getState().positions)
    },
    [storageKey, getNode],
  )

  return { nodes, commit }
}
