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
import { rollupLinks } from '../../graph/containers'
import { chooseSides, sourceHandleId, targetHandleId } from '../../graph/edgeSides'
import { NODE_HEIGHT, NODE_WIDTH } from '../../graph/layout'
import { FOCUS_PADDING, INSPECTOR_RESERVED, fitPadding } from '../../graph/viewport'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { CardNode } from './CardNode'
import type { AppNode } from './canvasNodes'
import { CollectionNode } from './CollectionNode'
import { ConnectionEdge, type ConnectionEdgeType } from './ConnectionEdge'
import { RollupEdge, type RollupEdgeType } from './RollupEdge'
import { useContainerLayout } from './useContainerLayout'
import { useFlatLayout } from './useFlatLayout'
import { useInspectorShown, useMinimapFits } from './useMinimapFits'
import { ViewControls } from './ViewControls'
import { useWorkspace } from './WorkspaceContext'

const nodeTypes = { card: CardNode, collection: CollectionNode }
const edgeTypes = { connection: ConnectionEdge, rollup: RollupEdge }
const DRAFT_EDGE_ID = '__draft__'

type AppEdge = ConnectionEdgeType | RollupEdgeType

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
  const { data, visible, itemsById, activeGroupIds } = useWorkspace()
  const { fitView, screenToFlowPosition } = useReactFlow<AppNode, AppEdge>()

  const draft = useUiStore((s) => s.draft)
  const showEdgeLabels = useUiStore((s) => s.preferences.showEdgeLabels)
  const presentation = useUiStore((s) => s.preferences.collectionPresentation)
  // The minimap sits top right, left of the inspector while it shows; it hides on a narrow canvas.
  const minimapFits = useMinimapFits()
  const inspectorShown = useInspectorShown()
  const showMinimap = useUiStore((s) => s.preferences.showMinimap) && minimapFits
  const selectionRequest = useUiStore((s) => s.selectionRequest)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)

  // Two presentations share everything but node layout: flat cards, or collections as containers.
  const containersOn = presentation === 'containers'
  const flat = useFlatLayout(!containersOn)
  const containers = useContainerLayout(containersOn)
  const derivedNodes: AppNode[] = containersOn ? containers.nodes : flat.nodes

  // Fit the view whenever content first appears for a set of collections (load, reload, ticking
  // collections, switching presentation), so nothing starts off screen.
  const fittedFor = useRef<string | null>(null)
  const scopeKey = `${presentation}:${[...activeGroupIds].sort().join('|')}`
  const hasNodes = derivedNodes.length > 0
  useEffect(() => {
    if (!hasNodes || fittedFor.current === scopeKey) return
    fittedFor.current = scopeKey
    const { selected } = useUiStore.getState()
    const padding = fitPadding(selected.nodes.length + selected.edges.length > 0)
    requestAnimationFrame(() => requestAnimationFrame(() => fitView({ padding, duration: 0 })))
  }, [hasNodes, scopeKey, fitView])

  const derivedEdges: AppEdge[] = useMemo(() => {
    // Connections to cards hidden in a collapsed collection are redrawn from the collection.
    const shown = data.links.filter((l) => visible.linkIds.has(l.id))
    const { links, rollups } = containersOn ? rollupLinks(shown, containers.hiddenIn) : { links: shown, rollups: [] }
    const edges: AppEdge[] = links
      .map((link): ConnectionEdgeType => {
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
    for (const r of rollups) {
      const single = r.types.length === 1 ? styleForType(r.types[0] || undefined) : null
      edges.push({
        id: r.id,
        source: r.sourceId,
        target: r.targetId,
        type: 'rollup',
        selectable: false,
        focusable: false,
        reconnectable: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: single?.colour ?? 'var(--color-ink-3)', width: 18, height: 18 },
        data: { count: r.linkIds.length, types: r.types },
      })
    }
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
  }, [data.links, visible, draft, showEdgeLabels, hoveredEdge, itemsById, containersOn, containers.hiddenIn])

  // React Flow owns transient drag state; selection lives in the store so it survives edges being
  // swapped (an edited connection gets a new URI) without React Flow reporting an empty selection.
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([])
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
    // Cards inside a container have positions relative to it.
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const rects = new Map(
      nodes.map((n) => {
        const parent = n.parentId ? byId.get(n.parentId) : undefined
        return [
          n.id,
          {
            x: n.position.x + (parent?.position.x ?? 0),
            y: n.position.y + (parent?.position.y ?? 0),
            width: n.measured?.width ?? n.width ?? NODE_WIDTH,
            height: n.measured?.height ?? n.height ?? NODE_HEIGHT,
          },
        ]
      }),
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
    (changes: EdgeChange<AppEdge>[]) => {
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
  const onReconnect = useCallback((oldEdge: AppEdge, conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    if (conn.source === oldEdge.source && conn.target === oldEdge.target) return
    useUiStore.getState().setReconnectDraft({ linkId: oldEdge.id, sourceId: conn.source, targetId: conn.target })
  }, [])

  // Connections only join cards: never a collection (Semble's endpoints are URLs or cards).
  const isValidConnection = useCallback(
    (conn: Connection | AppEdge) =>
      conn.source !== conn.target && itemsById.has(conn.source) && itemsById.has(conn.target),
    [itemsById],
  )

  // React Flow applies the change; the active presentation saves positions once a move ends.
  const nodesRef = useRef<AppNode[]>([])
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  const handleNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      onNodesChange(changes)
      applySelectChanges('nodes', changes)
      if (containersOn) containers.onNodesChange(changes, nodesRef.current)
      else flat.commit(changes)
    },
    [onNodesChange, applySelectChanges, containersOn, containers, flat],
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
          useUiStore.getState().setContextMenu(
            node.type === 'collection'
              ? {
                  kind: 'collection',
                  x: e.clientX,
                  y: e.clientY,
                  collectionId: node.id,
                  flow: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                }
              : { kind: 'card', x: e.clientX, y: e.clientY, cardId: node.id },
          )
        }}
        onNodeDoubleClick={(_, node) => {
          if (node.type === 'collection') useUiStore.getState().toggleCollapsed(node.id)
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
            nodeColor={(n) => (n.type === 'collection' ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'var(--color-line-strong)')}
            maskColor="color-mix(in srgb, var(--color-canvas) 70%, transparent)"
          />
        ) : null}
      </ReactFlow>
    </div>
  )
}
