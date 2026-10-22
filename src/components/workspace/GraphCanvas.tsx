import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeSelectionChange,
  type NodeChange,
  type NodeSelectionChange,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { chooseSides, sourceHandleId, targetHandleId } from '../../graph/edgeSides'
import { FOCUS_PADDING, INSPECTOR_RESERVED, fitPadding } from '../../graph/viewport'
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH, type Positions } from '../../graph/layout'
import { layoutStorageKey, loadPositions, savePositions } from '../../graph/positions'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { CardNode, type CardNodeType } from './CardNode'
import { ConnectionEdge, type ConnectionEdgeType } from './ConnectionEdge'
import { useInspectorShown, useMinimapFits } from './useMinimapFits'
import { ViewControls } from './ViewControls'
import { useWorkspace } from './WorkspaceContext'

const nodeTypes = { card: CardNode }
const edgeTypes = { connection: ConnectionEdge }
const DRAFT_EDGE_ID = '__draft__'

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
 * Drops selected ids that were on the canvas and have now gone (deleted or filtered out). Ids
 * never seen yet are kept: an edited connection's new URI is selected before it first renders.
 */
function pruneSelection(kind: 'nodes' | 'edges', before: Set<string>, now: Set<string>) {
  const { selected, setSelected } = useUiStore.getState()
  const kept = selected[kind].filter((id) => now.has(id) || !before.has(id))
  if (kept.length !== selected[kind].length) setSelected({ ...selected, [kind]: kept })
}

export function GraphCanvas() {
  const { did } = useAuth()
  const { data, visible, activeGroupIds, groupNames, annotationsByItem, itemsById } = useWorkspace()
  const { fitView, getNode, screenToFlowPosition } = useReactFlow<CardNodeType, ConnectionEdgeType>()

  const layoutKey = useUiStore((s) => s.layoutKey)
  const positions = useUiStore((s) => s.positions)
  const draft = useUiStore((s) => s.draft)
  const showEdgeLabels = useUiStore((s) => s.showEdgeLabels)
  // The minimap and view controls both sit along the bottom; on a narrow canvas only the controls fit.
  const minimapFits = useMinimapFits()
  const inspectorShown = useInspectorShown()
  const showMinimap = useUiStore((s) => s.showMinimap) && minimapFits
  const selectionRequest = useUiStore((s) => s.selectionRequest)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)

  const storageKey = layoutStorageKey(did, activeGroupIds)

  // 1. Load saved positions for this DID + collection set.
  useEffect(() => {
    useUiStore.getState().loadLayout(storageKey, loadPositions(storageKey))
  }, [storageKey])

  // 2. Lay out any visible items that have no position yet (first load, or new cards).
  const missing = useMemo(
    () => (layoutKey === storageKey ? data.items.filter((i) => !positions[i.id]) : []),
    [layoutKey, storageKey, data.items, positions],
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

  const derivedNodes: CardNodeType[] = useMemo(() => {
    const multi = activeGroupIds.length > 1
    return data.items
      .filter((i) => visible.itemIds.has(i.id) && positions[i.id])
      .map((item) => ({
        id: item.id,
        type: 'card' as const,
        position: positions[item.id]!,
        ariaLabel: `Card: ${item.title}`,
        data: {
          item,
          annotationCount: annotationsByItem.get(item.id)?.length ?? 0,
          groupBadges: multi ? item.groupIds.map((g) => groupNames.get(g) ?? 'Collection') : [],
        },
      }))
  }, [data.items, visible.itemIds, positions, annotationsByItem, groupNames, activeGroupIds.length])

  const derivedEdges: ConnectionEdgeType[] = useMemo(() => {
    const edges: ConnectionEdgeType[] = data.links
      .filter((l) => visible.linkIds.has(l.id))
      .map((link) => {
        const style = styleForType(link.type)
        const colour = link.pending ? 'var(--color-accent)' : style.colour
        return {
          id: link.id,
          source: link.sourceId,
          target: link.targetId,
          type: 'connection' as const,
          ariaLabel: `${style.label} connection from ${itemsById.get(link.sourceId)?.title} to ${itemsById.get(link.targetId)?.title}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: colour, width: 18, height: 18 },
          reconnectable: !link.pending,
          data: { link, style, pending: link.pending, showLabel: showEdgeLabels, hovered: hoveredEdge === link.id },
        }
      })
    if (draft && visible.itemIds.has(draft.sourceId) && visible.itemIds.has(draft.targetId)) {
      edges.push({
        id: DRAFT_EDGE_ID,
        source: draft.sourceId,
        target: draft.targetId,
        type: 'connection',
        selectable: false,
        reconnectable: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-accent)', width: 18, height: 18 },
        data: { style: styleForType(draft.type), pending: true },
      })
    }
    return edges
  }, [data.links, visible, draft, showEdgeLabels, hoveredEdge, itemsById])

  // React Flow owns transient drag state; selection lives in the store so it survives edges being
  // swapped (an edited connection gets a new URI) without React Flow reporting an empty selection.
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<ConnectionEdgeType>([])
  const prevIds = useRef({ nodes: new Set<string>(), edges: new Set<string>() })
  useEffect(() => {
    const ids = new Set(derivedNodes.map((n) => n.id))
    pruneSelection('nodes', prevIds.current.nodes, ids)
    prevIds.current.nodes = ids
    const selected = new Set(useUiStore.getState().selected.nodes)
    setNodes(derivedNodes.map((n) => (selected.has(n.id) ? { ...n, selected: true } : n)))
  }, [derivedNodes, setNodes])
  useEffect(() => {
    const ids = new Set(derivedEdges.map((e) => e.id))
    pruneSelection('edges', prevIds.current.edges, ids)
    prevIds.current.edges = ids
    const selected = new Set(useUiStore.getState().selected.edges)
    setEdges(derivedEdges.map((e) => (selected.has(e.id) ? { ...e, selected: true } : e)))
  }, [derivedEdges, setEdges])

  // Attach each edge to the facing sides of its two cards, from live positions so edges follow a
  // card while it is being dragged. React Flow's own reconnect anchors then sit at the right ends.
  const displayEdges = useMemo(() => {
    const rects = new Map(
      nodes.map((n) => [
        n.id,
        { x: n.position.x, y: n.position.y, width: n.measured?.width ?? NODE_WIDTH, height: n.measured?.height ?? NODE_HEIGHT },
      ]),
    )
    return edges.map((e) => {
      const s = rects.get(e.source)
      const t = rects.get(e.target)
      if (!s || !t) return e
      const sides = chooseSides(s, t)
      const sourceHandle = sourceHandleId(sides.source)
      const targetHandle = targetHandleId(sides.target)
      return e.sourceHandle === sourceHandle && e.targetHandle === targetHandle ? e : { ...e, sourceHandle, targetHandle }
    })
  }, [edges, nodes])

  // Programmatic selection from the inspector or search.
  useEffect(() => {
    if (!selectionRequest) return
    const nodeIds = new Set(selectionRequest.nodes)
    const edgeIds = new Set(selectionRequest.edges)
    setNodes((ns) => ns.map((n) => ({ ...n, selected: nodeIds.has(n.id) })))
    setEdges((es) => es.map((e) => ({ ...e, selected: edgeIds.has(e.id) })))
    useUiStore.getState().setSelected({ nodes: [...nodeIds], edges: [...edgeIds] })
    const focus = [...nodeIds]
    for (const id of edgeIds) {
      const link = data.links.find((l) => l.id === id)
      if (link) focus.push(link.sourceId, link.targetId)
    }
    if (selectionRequest.focus && focus.length) fitView({ nodes: focus.map((id) => ({ id })), padding: FOCUS_PADDING, duration: 300, maxZoom: 1.2 })
    // Only when a new request arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionRequest?.nonce])

  // Only user-driven select/deselect changes update the store. React Flow's onSelectionChange would
  // also fire when we swap an edge's id, briefly reporting an empty selection.
  const applySelectChanges = useCallback((kind: 'nodes' | 'edges', changes: (NodeChange | EdgeChange)[]) => {
    const selects = changes.filter((c): c is NodeSelectionChange | EdgeSelectionChange => c.type === 'select')
    if (selects.length === 0) return
    const { selected, setSelected } = useUiStore.getState()
    const ids = new Set(selected[kind])
    for (const c of selects) {
      if (c.selected) ids.add(c.id)
      else ids.delete(c.id)
    }
    setSelected({ ...selected, [kind]: [...ids] })
  }, [])

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<ConnectionEdgeType>[]) => {
      onEdgesChange(changes)
      applySelectChanges('edges', changes)
    },
    [onEdgesChange, applySelectChanges],
  )

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    useUiStore.getState().setDraft({ sourceId: conn.source, targetId: conn.target })
  }, [])

  // Dragging an edge end onto another card proposes a move; nothing is written until confirmed.
  const onReconnect = useCallback((oldEdge: ConnectionEdgeType, conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    if (conn.source === oldEdge.source && conn.target === oldEdge.target) return
    useUiStore.getState().setReconnectDraft({ linkId: oldEdge.id, sourceId: conn.source, targetId: conn.target })
  }, [])

  const isValidConnection = useCallback((conn: Connection | ConnectionEdgeType) => conn.source !== conn.target, [])

  // Persist positions when a move completes (mouse drag end or keyboard arrow move).
  const handleNodesChange = useCallback(
    (changes: NodeChange<CardNodeType>[]) => {
      onNodesChange(changes)
      applySelectChanges('nodes', changes)
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
    [onNodesChange, applySelectChanges, storageKey, getNode],
  )

  // Delete/Backspace deletes selected connections (after confirmation) wherever focus is, except
  // in text fields and while a dialog is open. Cards are never deleted by this app.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('dialog[open]')) return
      const { selected, requestDeleteLinks } = useUiStore.getState()
      if (selected.edges.length > 0 && selected.nodes.length === 0) {
        e.preventDefault()
        requestDeleteLinks(selected.edges)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          useUiStore.getState().setContextMenu({
            kind: 'pane',
            x: e.clientX,
            y: e.clientY,
            flow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
          })
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          useUiStore.getState().requestSelection({ nodes: [node.id], edges: [] }, { focus: false })
          useUiStore.getState().setContextMenu({ kind: 'card', x: e.clientX, y: e.clientY, cardId: node.id })
        }}
        onReconnect={onReconnect}
        reconnectRadius={14}
        isValidConnection={isValidConnection}
        onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdge(null)}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        connectionLineStyle={{ stroke: 'var(--color-accent)', strokeWidth: 2, strokeDasharray: '6 4' }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
        ariaLabelConfig={{ 'node.a11yDescription.default': 'Press Enter to select. Use arrow keys to move the selected card.' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <ViewControls />
        {showMinimap ? (
          <MiniMap
            pannable
            zoomable
            position="top-right"
            // Glides left of the floating inspector while it is showing.
            className="transition-[margin] duration-150 ease-out motion-reduce:transition-none"
            style={{ marginRight: inspectorShown ? INSPECTOR_RESERVED : 16, marginTop: 16 }}
            ariaLabel="Minimap"
            nodeStrokeWidth={2}
            nodeColor="var(--color-line-strong)"
            maskColor="color-mix(in srgb, var(--color-canvas) 70%, transparent)"
          />
        ) : null}
      </ReactFlow>
    </div>
  )
}
