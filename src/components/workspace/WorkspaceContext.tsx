import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { applyFilters, type FilterResult } from '../../graph/filters'
import type { GraphItem, GraphLink } from '../../graph/model'
import { loadSelectedGroups, saveSelectedGroups } from '../../graph/positions'
import { useWorkspaceGraph, type WorkspaceGraph } from '../../queries/useWorkspaceGraph'
import type { StoredRecord } from '../../services/sources/records'
import { cardToItem } from '../../services/sources/semble/mapping'
import type { ConnectionRecord } from '../../services/sources/semble/types'
import { useUiStore } from '../../state/uiStore'

type WorkspaceValue = WorkspaceGraph & {
  visible: FilterResult
  itemsById: Map<string, GraphItem>
  linksById: Map<string, GraphLink>
  /** A graph item by id, falling back to the user's library for cards not on the canvas. */
  resolveItem: (id: string) => GraphItem | undefined
  /** Stored connection records by AT URI, for edits that need the original record and CID. */
  connectionRecords: Map<string, StoredRecord<ConnectionRecord>>
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

/** Restores the collection selection for this DID and saves changes. */
function useSelectionPersistence(did: string) {
  useEffect(() => {
    useUiStore.getState().setSelectedGroupIds(loadSelectedGroups(did))
    return useUiStore.subscribe((s, prev) => {
      if (s.selectedGroupIds !== prev.selectedGroupIds) saveSelectedGroups(did, s.selectedGroupIds)
    })
  }, [did])
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { did } = useAuth()
  useSelectionPersistence(did)
  const graph = useWorkspaceGraph()
  const filters = useUiStore((s) => s.filters)
  const showExternal = useUiStore((s) => s.preferences.showExternal)

  const visible = useMemo(
    () => applyFilters(graph.data, filters, graph.annotationsByItem, graph.groupNames, { showExternal }),
    [graph.data, filters, graph.annotationsByItem, graph.groupNames, showExternal],
  )
  const itemsById = useMemo(() => new Map(graph.data.items.map((i) => [i.id, i])), [graph.data.items])
  const linksById = useMemo(() => new Map(graph.data.links.map((l) => [l.id, l])), [graph.data.links])
  const connectionRecords = useMemo(
    () => new Map((graph.connections.data?.connections ?? []).map((c) => [c.uri, c])),
    [graph.connections.data],
  )

  const libraryCards = useMemo(() => new Map((graph.library.data?.cards ?? []).map((c) => [c.uri, c])), [graph.library.data])
  const resolveItem = useCallback(
    (id: string) => {
      const item = itemsById.get(id)
      if (item) return item
      const card = libraryCards.get(id)
      return card ? cardToItem(card, [], []) : undefined
    },
    [itemsById, libraryCards],
  )

  const value = useMemo(
    () => ({ ...graph, visible, itemsById, linksById, connectionRecords, resolveItem }),
    [graph, visible, itemsById, linksById, connectionRecords, resolveItem],
  )
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
