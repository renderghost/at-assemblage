import { useReactFlow } from '@xyflow/react'
import { useMemo } from 'react'
import { useAuth, useAuthContext } from '../../auth/AuthContext'
import { buildSearchIndex, type CardEntry } from '../../commands/searchIndex'
import type { CommandContext } from '../../commands/types'
import { isFiltering } from '../../graph/filters'
import type { GraphGroup, GraphItem, GraphLink } from '../../graph/model'
import { fitPadding } from '../../graph/viewport'
import { motion } from '../../preferences/appearance'
import { useMarginNotes } from '../../queries/margin'
import { useConnections, useCreateConnection, useEditConnection } from '../../queries/semble'
import { isDuplicateLink, planConnectionEdit, type ConnectionChanges } from '../../services/sources/semble/mapping'
import { useUiStore } from '../../state/uiStore'
import { useWorkspace } from '../workspace/WorkspaceContext'

const DURATION = 250

/**
 * Everything commands need, built while the bar is open. Opening the bar also
 * loads your connections and Margin notes, so search covers the whole library
 * even when nothing is on the canvas.
 */
export function useCommandContext() {
  const ws = useWorkspace()
  const { handle, did } = useAuth()
  const { signOut } = useAuthContext()
  const flow = useReactFlow()
  const connections = useConnections(true)
  const margin = useMarginNotes(true)
  const create = useCreateConnection()
  const edit = useEditConnection()
  const preferences = useUiStore((s) => s.preferences)
  const selected = useUiStore((s) => s.selected)
  const filters = useUiStore((s) => s.filters)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const collectionLayouts = useUiStore((s) => s.collectionLayouts)

  const index = useMemo(
    () => buildSearchIndex({ library: ws.library.data, groups: ws.groups, connections: connections.data, marginNotes: margin.data?.records }),
    [ws.library.data, ws.groups, connections.data, margin.data],
  )

  const ctx = useMemo((): CommandContext => {
    const containers = preferences.collectionPresentation === 'containers'
    // Outside cards (dashed, reached by a connection) don't count: showing one means adding its collections.
    const items = new Set([...ws.visible.itemIds].filter((id) => !ws.itemsById.get(id)?.external))
    const onCanvas = { items, links: ws.visible.linkIds, groups: new Set(ws.activeGroupIds) }
    const groupsById = new Map(ws.groups.map((g) => [g.id, g]))

    // Adds the collections a card is in (when it isn't showing), clears filters hiding it, and
    // opens collapsed boxes holding it.
    const bringIn = (entry: CardEntry | undefined) => {
      const s = useUiStore.getState()
      if (!entry) return
      if (!onCanvas.items.has(entry.id)) {
        const missing = entry.collectionIds.filter((id) => !s.selectedGroupIds.includes(id))
        if (missing.length) s.setSelectedGroupIds([...s.selectedGroupIds, ...missing])
        if (isFiltering(s.filters)) {
          s.resetFilters()
          s.notify({ tone: 'info', message: 'Filters cleared to show it.' })
        }
      }
      if (containers) for (const id of entry.collectionIds) if (s.collectionLayouts[id]?.collapsed) s.toggleCollapsed(id, false)
    }

    return {
      index,
      groups: ws.groups,
      onCanvas,
      selection: {
        cards: selected.nodes.map((id) => ws.itemsById.get(id)).filter((i): i is GraphItem => !!i),
        links: selected.edges.map((id) => ws.linksById.get(id)).filter((l): l is GraphLink => !!l),
        collections: selected.nodes.map((id) => groupsById.get(id)).filter((g): g is GraphGroup => !!g),
      },
      preferences,
      containers,
      collapsed: (id) => !!collectionLayouts[id]?.collapsed,
      handle,
      did,
      filtering: isFiltering(filters),
      sidebarOpen,
      flow: {
        fitView: () => {
          const { selected: sel } = useUiStore.getState()
          void flow.fitView({ padding: fitPadding(sel.nodes.length + sel.edges.length > 0), duration: motion(DURATION) })
        },
        zoomIn: () => void flow.zoomIn({ duration: motion(DURATION) }),
        zoomOut: () => void flow.zoomOut({ duration: motion(DURATION) }),
        zoomTo100: () => void flow.zoomTo(1, { duration: motion(DURATION) }),
      },
      reveal: {
        card: (entry) => {
          bringIn(entry)
          useUiStore.getState().requestSelection({ nodes: [entry.id], edges: [] })
        },
        collection: (id) => {
          const s = useUiStore.getState()
          if (!s.selectedGroupIds.includes(id)) s.setSelectedGroupIds([...s.selectedGroupIds, id])
          if (containers) s.requestSelection({ nodes: [id], edges: [] })
          else s.requestFocus({ nodes: index.cards.filter((c) => c.collectionIds.includes(id)).map((c) => c.id), edges: [] })
        },
        connection: ({ id, sourceId, targetId }) => {
          if (!onCanvas.links.has(id)) {
            const ends = [sourceId, targetId].map((x) => (x ? index.cardsById.get(x) : undefined))
            bringIn(ends.find((e) => e && e.collectionIds.length))
          }
          useUiStore.getState().requestSelection({ nodes: [], edges: [id] })
        },
      },
      createConnection: (source, target, type, note) => {
        create.mutate({ source, target, sourceId: source.id, targetId: target.id, type, note, existing: ws.data.links })
        // Make sure you can see what you just made.
        if (!onCanvas.items.has(source.id) && !onCanvas.items.has(target.id)) {
          const entry = index.cardsById.get(source.id)
          if (entry) {
            bringIn(entry)
            useUiStore.getState().requestSelection({ nodes: [source.id], edges: [] })
          }
        }
      },
      editConnection: (id, change) => {
        const { notify } = useUiStore.getState()
        const stored = ws.connectionRecords.get(id)
        if (!stored) return notify({ tone: 'error', message: 'That connection is no longer in your PDS.' })
        const changes: ConnectionChanges = { type: change.type, note: change.note }
        if (change.reverse) Object.assign(changes, { source: stored.value.target, target: stored.value.source })
        let plan
        try {
          plan = planConnectionEdit(stored.value, changes)
        } catch {
          return notify({ tone: 'error', message: 'Notes are limited to 1000 characters.' })
        }
        if (plan.kind === 'noop') return
        const link = ws.linksById.get(id)
        if (link && plan.kind === 'replace') {
          const [s, t] = change.reverse ? [link.targetId, link.sourceId] : [link.sourceId, link.targetId]
          const others = ws.data.links.filter((l) => l.id !== id)
          if (isDuplicateLink(others, s, t, plan.record.connectionType ?? '')) {
            return notify({ tone: 'error', message: 'That would duplicate a connection you already have.' })
          }
        }
        edit.mutate({ stored, plan })
      },
      refetchAll: () => void ws.refetchAll(),
      signOut: () => void signOut(),
    }
  }, [index, ws, selected, preferences, filters, sidebarOpen, collectionLayouts, handle, did, flow, create, edit, signOut])

  return {
    ctx,
    loading: ws.library.isPending,
    error: ws.library.isError ? ws.library.error : null,
    retry: () => void ws.library.refetch(),
  }
}
