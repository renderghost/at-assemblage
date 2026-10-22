import type { IconName } from '../components/ui/Icon'
import type { GraphGroup, GraphItem, GraphLink } from '../graph/model'
import type { Preferences } from '../preferences/preferences'
import type { SelectionIds } from '../state/uiStore'
import type { Range } from './match'
import type { CardEntry, CollectionEntry, SearchIndex } from './searchIndex'

/** What a row's left-hand icon shows. */
export type RowIcon =
  | { kind: 'icon'; name: IconName }
  | { kind: 'site'; domain?: string; note?: boolean }
  | { kind: 'type'; type?: string }

/** The right-hand pane for the highlighted row. */
export type Preview =
  | { kind: 'card'; entry: CardEntry; onCanvas: boolean }
  | { kind: 'collection'; entry: CollectionEntry; shown: boolean }
  | {
      kind: 'connection'
      link: { type?: string; note?: string; sourceTitle: string; targetTitle: string }
      onCanvas: boolean
      /** Not saved yet: the note step of connecting, or editing a note. */
      draft?: string
    }
  | { kind: 'command'; icon: IconName; title: string; description?: string; shortcut?: string; current?: string }
  | { kind: 'url'; url: string; existing?: CardEntry }
  | { kind: 'type'; type: string; reason?: string }

/** Running a row closes the bar, unless it pushes another view or asks to stay open. */
export type RunResult = void | { push: View } | 'stay'

export type Row = {
  /** Unique within its view. */
  id: string
  icon: RowIcon
  title: string
  titleRanges?: Range[]
  subtitle?: string
  /** Why a search matched, when it wasn't the title (a note, a description). */
  detail?: { label: string; text: string; ranges: Range[] }
  /** Keyboard shortcut, shown as keys on the right. */
  shortcut?: string
  /** Short tag on the right, e.g. "Recommended" or "On canvas". */
  badge?: string
  preview?: Preview
  /** Cards and connections to glide to and spotlight while this row is highlighted. */
  spotlight?: SelectionIds
  run?: () => RunResult
  /** What Enter does, for the footer: "Show on canvas", "Run", … */
  runLabel?: string
  /** Secondary actions, opened with ⌘K or →. */
  actions?: () => Row[]
  /** Frecency key recorded when the row runs. */
  recentKey?: string
  danger?: boolean
  /** Not selectable (a placeholder while loading). */
  disabled?: boolean
}

export type Section = {
  id: string
  title?: string
  rows: Row[]
  /** Rows hidden behind "Show N more". */
  more?: Row[]
}

export type View = {
  id: string
  /** Shown as a chip before the field, e.g. "Connect radioghost to". */
  chip: string
  placeholder: string
  /** 'text': the field is free text (a note) and Enter submits it. */
  mode?: 'search' | 'text'
  sections: (query: string, live: LiveData) => Section[]
  submit?: (text: string) => RunResult
  submitLabel?: string
  textLimit?: number
  /** Row to highlight first. */
  initialRowId?: (live: LiveData) => string | undefined
  /** Two cards being connected: the bar looks up a recommended type for them. */
  pair?: { source: GraphItem; target: GraphItem }
  /** Text mode: what the text will become, shown as you type. */
  preview?: (text: string) => Preview
  /** Shown instead of rows when there are none. */
  empty?: (query: string) => { title: string; hint?: string }
}

/** Data the bar keeps fresh for views pushed earlier. */
export type LiveData = { recommendation: { type: string; reason: string } | null }

export type CommandSection = 'Suggestions' | 'Create' | 'Canvas' | 'Settings' | 'Help & account'

/** A command in the bar's registry. Providers only return commands that make sense right now. */
export type Command = {
  id: string
  title: string
  section: CommandSection
  icon: IconName
  keywords?: string[]
  shortcut?: string
  description?: string
  /** Current value, e.g. "Now: Curved". */
  subtitle?: string
  /** Listed with an empty query. Settings options are found by searching instead. */
  listed?: boolean
  run: () => RunResult
  runLabel?: string
  danger?: boolean
}

export type CommandContext = {
  index: SearchIndex
  groups: GraphGroup[]
  /** What's on the canvas right now (after filters). */
  onCanvas: { items: Set<string>; links: Set<string>; groups: Set<string> }
  selection: { cards: GraphItem[]; links: GraphLink[]; collections: GraphGroup[] }
  preferences: Preferences
  containers: boolean
  collapsed: (groupId: string) => boolean
  handle: string
  did: string
  filtering: boolean
  sidebarOpen: boolean
  flow: {
    fitView: () => void
    zoomIn: () => void
    zoomOut: () => void
    zoomTo100: () => void
  }
  reveal: {
    card: (entry: CardEntry) => void
    collection: (id: string) => void
    connection: (entry: { id: string; sourceId?: string; targetId?: string }) => void
  }
  createConnection: (source: GraphItem, target: GraphItem, type: string, note?: string) => void
  /** Type and note changes; `reverse` swaps the ends. */
  editConnection: (id: string, change: { type?: string; note?: string; reverse?: boolean }) => void
  refetchAll: () => void
  signOut: () => void
}

export type CommandProvider = (ctx: CommandContext) => Command[]
