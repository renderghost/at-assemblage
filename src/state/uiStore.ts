import { create } from 'zustand'
import { EMPTY_FILTERS, type GraphFilters } from '../graph/filters'
import type { Position, Positions } from '../graph/layout'

export type SidebarTab = 'collections' | 'filters'

export type InspectorSection = 'details' | 'notes' | 'collections' | 'connections' | 'suggestions' | 'connection' | 'selection'

// v2: Details and Notes now open by default.
const SECTIONS_KEY = 'assemblage:inspector-sections:v2'
const DEFAULT_SECTIONS: Record<InspectorSection, boolean> = {
  details: true,
  notes: true,
  collections: false,
  connections: false,
  suggestions: false,
  connection: true,
  selection: true,
}

function loadSections(): Record<InspectorSection, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}') as Partial<Record<InspectorSection, boolean>>
    return { ...DEFAULT_SECTIONS, ...saved }
  } catch {
    return { ...DEFAULT_SECTIONS }
  }
}

const SIDEBAR_KEY = 'assemblage:sidebar-open:v1'

function loadSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== 'false'
  } catch {
    return true
  }
}

function saveSidebarOpen(open: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(open))
  } catch {
    // Storage unavailable: the choice still holds for this session.
  }
}

export type SelectionIds = { nodes: string[]; edges: string[] }

/** An edge being created: endpoints from the drag, type/note prefilled on retry. */
export type LinkDraft = { sourceId: string; targetId: string; type?: string; note?: string }

/** Opens the add-card form, optionally prefilled and followed by a connection to an existing card. */
export type AddCardRequest = {
  url?: string
  title?: string
  description?: string
  imageUrl?: string
  collectionIds?: string[]
  connectTo?: { cardId: string; direction: 'outgoing' | 'incoming'; type?: string }
  /** Canvas position for the new card (e.g. where the user right-clicked). */
  position?: { x: number; y: number }
}

export type ContextMenuState =
  | { kind: 'pane'; x: number; y: number; flow: { x: number; y: number } }
  | { kind: 'card'; x: number; y: number; cardId: string }

export type Notice = {
  id: number
  tone: 'error' | 'success' | 'info'
  message: string
  retryDraft?: LinkDraft
}

type UiState = {
  selectedGroupIds: string[]
  /** Storage key the current `positions` belong to; null until loaded. */
  layoutKey: string | null
  positions: Positions
  selected: SelectionIds
  /** Programmatic selection (e.g. clicking a related card in the inspector). */
  selectionRequest: (SelectionIds & { nonce: number; focus: boolean }) | null
  filters: GraphFilters
  draft: LinkDraft | null
  /** Connections awaiting delete confirmation. */
  pendingDeleteLinkIds: string[]
  /** A dragged edge end awaiting confirmation: the connection and its proposed endpoints. */
  reconnectDraft: { linkId: string; sourceId: string; targetId: string } | null
  showEdgeLabels: boolean
  showExternal: boolean
  showMinimap: boolean
  /** Left sidebar visibility; a per-browser preference, so it survives sign-out. */
  sidebarOpen: boolean
  sidebarTab: SidebarTab
  /** Which inspector sections are expanded; several can be open. Remembered per browser. */
  inspectorSections: Record<InspectorSection, boolean>
  notices: Notice[]
  addCardRequest: AddCardRequest | null
  /** Card ids whose edit / delete dialogs are open. */
  editCardId: string | null
  contextMenu: ContextMenuState | null
  deleteCardId: string | null

  setSelectedGroupIds: (ids: string[]) => void
  toggleGroup: (id: string) => void
  loadLayout: (key: string, positions: Positions) => void
  mergePositions: (positions: Positions) => void
  movePosition: (id: string, pos: Position) => void
  /** Positions chosen for cards that are being created; the canvas uses them instead of auto-layout. */
  pendingPlacements: Positions
  placeNewCard: (id: string, pos: Position) => void
  setSelected: (selected: SelectionIds) => void
  /** Selects in the canvas; `focus` (default true) also pans and zooms to it. */
  requestSelection: (selected: SelectionIds, opts?: { focus?: boolean }) => void
  setFilters: (patch: Partial<GraphFilters>) => void
  resetFilters: () => void
  setDraft: (draft: LinkDraft | null) => void
  requestDeleteLinks: (ids: string[]) => void
  setReconnectDraft: (draft: UiState['reconnectDraft']) => void
  setShowEdgeLabels: (show: boolean) => void
  setShowExternal: (show: boolean) => void
  setShowMinimap: (show: boolean) => void
  toggleSidebar: () => void
  setSidebarTab: (tab: SidebarTab) => void
  setInspectorSection: (section: InspectorSection, open: boolean) => void
  notify: (notice: Omit<Notice, 'id'>) => void
  dismissNotice: (id: number) => void
  openAddCard: (request?: AddCardRequest) => void
  closeAddCard: () => void
  setEditCardId: (id: string | null) => void
  setContextMenu: (menu: ContextMenuState | null) => void
  setDeleteCardId: (id: string | null) => void
  reset: () => void
}

const initial = {
  selectedGroupIds: [] as string[],
  layoutKey: null as string | null,
  positions: {} as Positions,
  pendingPlacements: {} as Positions,
  selected: { nodes: [], edges: [] } as SelectionIds,
  selectionRequest: null as UiState['selectionRequest'],
  filters: EMPTY_FILTERS,
  draft: null as LinkDraft | null,
  pendingDeleteLinkIds: [] as string[],
  reconnectDraft: null as UiState['reconnectDraft'],
  showEdgeLabels: false,
  showExternal: true,
  showMinimap: true,
  sidebarTab: 'collections' as SidebarTab,
  notices: [] as Notice[],
  addCardRequest: null as AddCardRequest | null,
  editCardId: null as string | null,
  contextMenu: null as ContextMenuState | null,
  deleteCardId: null as string | null,
}

let noticeId = 0

export const useUiStore = create<UiState>()((set) => ({
  ...initial,
  setSelectedGroupIds: (ids) => set({ selectedGroupIds: ids }),
  toggleGroup: (id) =>
    set((s) => ({
      selectedGroupIds: s.selectedGroupIds.includes(id)
        ? s.selectedGroupIds.filter((g) => g !== id)
        : [...s.selectedGroupIds, id],
    })),
  loadLayout: (layoutKey, positions) => set({ layoutKey, positions }),
  mergePositions: (positions) => set((s) => ({ positions: { ...s.positions, ...positions } })),
  movePosition: (id, pos) => set((s) => ({ positions: { ...s.positions, [id]: pos } })),
  placeNewCard: (id, pos) => set((s) => ({ pendingPlacements: { ...s.pendingPlacements, [id]: pos } })),
  setSelected: (selected) => set({ selected }),
  requestSelection: (selected, opts) =>
    set((s) => ({
      selected: { nodes: selected.nodes, edges: selected.edges },
      selectionRequest: { ...selected, focus: opts?.focus ?? true, nonce: (s.selectionRequest?.nonce ?? 0) + 1 },
    })),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  setDraft: (draft) => set({ draft }),
  requestDeleteLinks: (ids) => set({ pendingDeleteLinkIds: ids }),
  setReconnectDraft: (reconnectDraft) => set({ reconnectDraft }),
  setShowEdgeLabels: (showEdgeLabels) => set({ showEdgeLabels }),
  setShowExternal: (showExternal) => set({ showExternal }),
  setShowMinimap: (showMinimap) => set({ showMinimap }),
  sidebarOpen: loadSidebarOpen(),
  toggleSidebar: () =>
    set((s) => {
      saveSidebarOpen(!s.sidebarOpen)
      return { sidebarOpen: !s.sidebarOpen }
    }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  inspectorSections: loadSections(),
  setInspectorSection: (section, open) =>
    set((s) => {
      const inspectorSections = { ...s.inspectorSections, [section]: open }
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(inspectorSections))
      } catch {
        // Storage unavailable: the choice holds for this session.
      }
      return { inspectorSections }
    }),
  notify: (notice) => set((s) => ({ notices: [...s.notices.slice(-3), { ...notice, id: ++noticeId }] })),
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  openAddCard: (request = {}) => set({ addCardRequest: request }),
  closeAddCard: () => set({ addCardRequest: null }),
  setEditCardId: (editCardId) => set({ editCardId }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setDeleteCardId: (deleteCardId) => set({ deleteCardId }),
  reset: () => set({ ...initial, sidebarOpen: loadSidebarOpen(), inspectorSections: loadSections() }),
}))
