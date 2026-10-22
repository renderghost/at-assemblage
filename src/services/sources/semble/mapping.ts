import type { GraphData, GraphGroup, GraphItem, GraphLink } from '../../../graph/model'
import { network } from '../../../lexicons'
import { isAtUri } from '../../atproto/aturi'
import { cleanUrl, domainOf, normaliseUrl } from '../url'
import type { StoredRecord } from '../records'
import type {
  CardRecord,
  CollectionRecord,
  ConnectionRecord,
  SembleConnections,
  SembleLibrary,
} from './types'

export function collectionToGroup(rec: StoredRecord<CollectionRecord>, itemCount?: number): GraphGroup {
  return {
    id: rec.uri,
    name: rec.value.name,
    description: rec.value.description,
    itemCount,
    accessType: String(rec.value.accessType),
    createdAt: rec.value.createdAt,
    updatedAt: rec.value.updatedAt,
  }
}

/** Number of cards linked to each collection URI. */
export function countCardsByCollection(library: SembleLibrary): Map<string, number> {
  const counts = new Map<string, number>()
  for (const link of library.links) {
    const id = link.value.collection.uri
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

type UrlContent = network.cosmik.card.UrlContent
type NoteContent = network.cosmik.card.NoteContent

function urlContent(card: CardRecord): UrlContent | undefined {
  return network.cosmik.card.urlContent.isTypeOf(card.content) ? card.content : undefined
}

function noteContent(card: CardRecord): NoteContent | undefined {
  return network.cosmik.card.noteContent.isTypeOf(card.content) ? card.content : undefined
}

function shortAtUri(uri: string): string {
  const [, , authority = '', , rkey = ''] = uri.split('/')
  return `${authority.length > 24 ? `${authority.slice(0, 20)}…` : authority} / ${rkey}`
}

function firstLine(text: string, max = 80): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export function cardToItem(rec: StoredRecord<CardRecord>, groupIds: string[], notes: string[]): GraphItem {
  const card = rec.value
  const content = urlContent(card)
  const note = noteContent(card)
  const url = card.url ?? content?.url
  const meta = content?.metadata
  const endpoints = [rec.uri]
  if (url) endpoints.push(normaliseUrl(url))
  return {
    id: rec.uri,
    kind: String(card.type),
    title: meta?.title?.trim() || (url ? cleanUrl(url) : note ? firstLine(note.text) : 'Untitled card'),
    url,
    domain: domainOf(url),
    description: meta?.description ?? (note && !url ? note.text : undefined),
    imageUrl: meta?.imageUrl,
    siteName: meta?.siteName,
    doi: meta?.doi?.trim() || undefined,
    isbn: meta?.isbn?.trim() || undefined,
    notes,
    groupIds,
    endpoints,
    createdAt: card.createdAt,
  }
}

function connectionToLink(rec: StoredRecord<ConnectionRecord>, sourceId: string, targetId: string): GraphLink {
  return {
    id: rec.uri,
    sourceId,
    targetId,
    type: rec.value.connectionType,
    note: rec.value.note,
    createdAt: rec.value.createdAt,
    pending: rec.pending,
  }
}

/**
 * Joins Semble records into the generic graph for the selected collections.
 *
 * - Items: cards linked (via collectionLink) to any selected collection.
 *   NOTE cards with a `parentCard` are folded into their parent as notes.
 * - Links: connections with at least one end on a selected card, matched by
 *   card AT URI or normalised URL. The other end, if outside the selection,
 *   becomes an `external` item (library card, foreign card or bare URL).
 */
export function buildSembleGraph(
  selectedCollectionIds: readonly string[],
  library: SembleLibrary,
  connections: SembleConnections,
): GraphData {
  const selected = new Set(selectedCollectionIds)
  const warnings: string[] = []
  const cardsByUri = new Map(library.cards.map((c) => [c.uri, c]))

  const notesByParent = new Map<string, string[]>()
  for (const card of library.cards) {
    const parent = card.value.parentCard?.uri
    const note = noteContent(card.value)
    if (parent && note?.text.trim()) {
      notesByParent.set(parent, [...(notesByParent.get(parent) ?? []), note.text.trim()])
    }
  }

  const groupsByCard = new Map<string, string[]>()
  let missingCards = 0
  for (const link of library.links) {
    const collectionId = link.value.collection.uri
    if (!selected.has(collectionId)) continue
    const cardUri = link.value.card.uri
    if (!cardsByUri.has(cardUri)) {
      missingCards++
      continue
    }
    const groups = groupsByCard.get(cardUri) ?? []
    if (!groups.includes(collectionId)) groups.push(collectionId)
    groupsByCard.set(cardUri, groups)
  }
  if (missingCards) {
    warnings.push(`${missingCards} collection entr${missingCards === 1 ? 'y points' : 'ies point'} to cards that no longer exist.`)
  }

  const items: GraphItem[] = []
  const itemByEndpoint = new Map<string, string>()
  const register = (item: GraphItem) => {
    items.push(item)
    for (const endpoint of item.endpoints) {
      if (!itemByEndpoint.has(endpoint)) itemByEndpoint.set(endpoint, item.id)
    }
  }
  const regularIds = new Set<string>()
  for (const [cardUri, groupIds] of groupsByCard) {
    const item = cardToItem(cardsByUri.get(cardUri)!, groupIds, notesByParent.get(cardUri) ?? [])
    register(item)
    regularIds.add(item.id)
  }

  // Library cards outside the selection, indexed so off-graph endpoints can show real titles.
  const libraryByEndpoint = new Map<string, StoredRecord<CardRecord>>()
  for (const card of library.cards) {
    if (groupsByCard.has(card.uri) || card.value.parentCard) continue
    libraryByEndpoint.set(card.uri, card)
    const url = card.value.url ?? urlContent(card.value)?.url
    if (url && !libraryByEndpoint.has(normaliseUrl(url))) libraryByEndpoint.set(normaliseUrl(url), card)
  }

  const resolve = (endpoint: string) => itemByEndpoint.get(endpoint) ?? itemByEndpoint.get(normaliseUrl(endpoint))

  /** Creates (once) an external item for an endpoint that is not in the selected collections. */
  const externalFor = (endpoint: string): string => {
    const existing = resolve(endpoint)
    if (existing) return existing
    const card = libraryByEndpoint.get(endpoint) ?? libraryByEndpoint.get(normaliseUrl(endpoint))
    if (card) {
      const item = cardToItem(card, [], notesByParent.get(card.uri) ?? [])
      item.external = { label: 'In your library, not in the selected collections' }
      register(item)
      return item.id
    }
    if (isAtUri(endpoint)) {
      register({
        id: endpoint,
        kind: 'CARD',
        title: shortAtUri(endpoint),
        notes: [],
        groupIds: [],
        endpoints: [endpoint],
        external: { label: 'A card outside your library' },
      })
      return endpoint
    }
    const url = normaliseUrl(endpoint)
    register({
      id: `url:${url}`,
      kind: 'URL',
      title: cleanUrl(endpoint),
      url: endpoint,
      domain: domainOf(endpoint),
      notes: [],
      groupIds: [],
      endpoints: [url],
      external: { label: 'A page you have not saved as a card' },
    })
    return `url:${url}`
  }

  const links: GraphLink[] = []
  for (const rec of connections.connections) {
    const s = resolve(rec.value.source)
    const t = resolve(rec.value.target)
    const sourceInside = !!s && regularIds.has(s)
    const targetInside = !!t && regularIds.has(t)
    // Only connections that touch the selection are relevant.
    if (!sourceInside && !targetInside) continue
    const sourceId = sourceInside ? s! : externalFor(rec.value.source)
    const targetId = targetInside ? t! : externalFor(rec.value.target)
    links.push(connectionToLink(rec, sourceId, targetId))
  }

  const invalid = library.invalid + connections.invalid
  if (invalid) warnings.push(`${invalid} record${invalid === 1 ? '' : 's'} skipped because they do not match the Semble schema.`)

  return { items, links, warnings }
}

/** The value a new connection stores for an item: its URL when it has one (as Semble does), else its AT URI. */
export function endpointFor(item: Pick<GraphItem, 'id' | 'url'>): string {
  return item.url ?? item.id
}

export type ConnectionDraft = {
  source: Pick<GraphItem, 'id' | 'url'>
  target: Pick<GraphItem, 'id' | 'url'>
  type: string
  note?: string
}

/**
 * Builds and validates a `network.cosmik.connection` record. Throws a
 * LexValidationError if the result does not conform to the lexicon.
 */
export function buildConnectionRecord(draft: ConnectionDraft, now = new Date()): ConnectionRecord {
  const timestamp = now.toISOString() as ConnectionRecord['createdAt']
  const note = draft.note?.trim()
  const record = network.cosmik.connection.$build({
    source: endpointFor(draft.source),
    target: endpointFor(draft.target),
    connectionType: draft.type.trim().toUpperCase() || undefined,
    ...(note ? { note } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return network.cosmik.connection.$parse(record)
}

export function isDuplicateLink(links: readonly GraphLink[], sourceId: string, targetId: string, type: string): boolean {
  const t = type.trim().toUpperCase()
  return links.some((l) => l.sourceId === sourceId && l.targetId === targetId && (l.type ?? '').toUpperCase() === t)
}

export type ConnectionChanges = {
  type?: string
  note?: string
  /** New endpoint values (see `endpointFor`). */
  source?: string
  target?: string
}

/**
 * - `update`: only the note changed. Rewritten in place (same AT URI).
 * - `replace`: type or endpoints changed. Semble's indexer applies only note
 *   changes from record updates (see its ProcessConnectionFirehoseEventUseCase),
 *   so these must be a delete + create to stay in sync with Semble.
 */
export type EditPlan =
  | { kind: 'noop' }
  | { kind: 'update'; record: ConnectionRecord }
  | { kind: 'replace'; record: ConnectionRecord }

const normType = (t?: string) => t?.trim().toUpperCase() || undefined
const normNote = (n?: string) => n?.trim() || undefined

/** Plans an edit to an existing connection. The new record is validated against the lexicon. */
export function planConnectionEdit(existing: ConnectionRecord, changes: ConnectionChanges, now = new Date()): EditPlan {
  const next = {
    source: changes.source ?? existing.source,
    target: changes.target ?? existing.target,
    type: changes.type !== undefined ? normType(changes.type) : normType(existing.connectionType),
    note: changes.note !== undefined ? normNote(changes.note) : normNote(existing.note),
  }
  const structural =
    next.source !== existing.source || next.target !== existing.target || next.type !== normType(existing.connectionType)
  const noteChanged = next.note !== normNote(existing.note)
  if (!structural && !noteChanged) return { kind: 'noop' }

  const timestamp = now.toISOString() as ConnectionRecord['createdAt']
  const record = network.cosmik.connection.$parse(
    network.cosmik.connection.$build({
      source: next.source,
      target: next.target,
      ...(next.type ? { connectionType: next.type } : {}),
      ...(next.note ? { note: next.note } : {}),
      // Keep the original creation time: this is the same connection, edited.
      createdAt: existing.createdAt ?? timestamp,
      updatedAt: timestamp,
    }),
  )
  return { kind: structural ? 'replace' : 'update', record }
}
