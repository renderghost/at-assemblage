import type { GraphGroup, GraphItem } from '../graph/model'
import { network } from '../lexicons'
import type { StoredRecord } from '../services/sources/records'
import type { MarginNoteRecord } from '../services/sources/margin/notes'
import { cardToItem } from '../services/sources/semble/mapping'
import type { SembleConnections, SembleLibrary } from '../services/sources/semble/types'
import { cleanUrl, normaliseUrl } from '../services/sources/url'
import { matchFields, snippet, type Field, type Range } from './match'

/**
 * What the command bar searches: every card in your library (not only the
 * canvas), every collection, and every connection with a note. Built from the
 * raw records so it doesn't depend on which collections are shown.
 */

export type CardEntry = {
  kind: 'card'
  id: string
  item: GraphItem
  /** Every collection the card is in. */
  collectionIds: string[]
  marginNotes: string[]
  connectionCount: number
}

export type CollectionEntry = { kind: 'collection'; id: string; group: GraphGroup }

export type ConnectionEntry = {
  kind: 'connection'
  id: string
  type?: string
  note: string
  /** Library card ids at each end, when the end is one of your cards. */
  sourceId?: string
  targetId?: string
  sourceTitle: string
  targetTitle: string
}

export type SearchEntry = CardEntry | CollectionEntry | ConnectionEntry

export type SearchIndex = {
  cards: CardEntry[]
  collections: CollectionEntry[]
  connections: ConnectionEntry[]
  cardsById: Map<string, CardEntry>
  /** Card id by normalised URL, for "already in your library". */
  cardByUrl: Map<string, string>
}

export type IndexSources = {
  library?: SembleLibrary
  groups: readonly GraphGroup[]
  connections?: SembleConnections
  marginNotes?: readonly StoredRecord<MarginNoteRecord>[]
}

export function buildSearchIndex({ library, groups, connections, marginNotes }: IndexSources): SearchIndex {
  const cards: CardEntry[] = []
  const cardsById = new Map<string, CardEntry>()
  const cardByUrl = new Map<string, string>()

  const notesByParent = new Map<string, string[]>()
  const collectionsByCard = new Map<string, string[]>()
  for (const card of library?.cards ?? []) {
    const parent = card.value.parentCard?.uri
    const content = card.value.content
    const text = network.cosmik.card.noteContent.isTypeOf(content) ? content.text.trim() : undefined
    if (parent && text) notesByParent.set(parent, [...(notesByParent.get(parent) ?? []), text])
  }
  const known = new Set(groups.map((g) => g.id))
  for (const link of library?.links ?? []) {
    const id = link.value.collection.uri
    if (!known.has(id)) continue
    const list = collectionsByCard.get(link.value.card.uri) ?? []
    if (!list.includes(id)) list.push(id)
    collectionsByCard.set(link.value.card.uri, list)
  }

  const marginByUrl = new Map<string, string[]>()
  for (const rec of marginNotes ?? []) {
    const url = rec.value.target.source
    const text = rec.value.body?.value?.trim()
    if (!url || !text) continue
    const key = normaliseUrl(url)
    marginByUrl.set(key, [...(marginByUrl.get(key) ?? []), text])
  }

  for (const card of library?.cards ?? []) {
    if (card.value.parentCard) continue
    const collectionIds = collectionsByCard.get(card.uri) ?? []
    const item = cardToItem(card, collectionIds, notesByParent.get(card.uri) ?? [])
    const entry: CardEntry = {
      kind: 'card',
      id: card.uri,
      item,
      collectionIds,
      marginNotes: item.url ? (marginByUrl.get(normaliseUrl(item.url)) ?? []) : [],
      connectionCount: 0,
    }
    cards.push(entry)
    cardsById.set(entry.id, entry)
    if (item.url && !cardByUrl.has(normaliseUrl(item.url))) cardByUrl.set(normaliseUrl(item.url), entry.id)
  }

  const cardFor = (endpoint: string) => cardsById.get(endpoint) ?? cardsById.get(cardByUrl.get(normaliseUrl(endpoint)) ?? '')
  const connectionEntries: ConnectionEntry[] = []
  for (const rec of connections?.connections ?? []) {
    const source = cardFor(rec.value.source)
    const target = cardFor(rec.value.target)
    if (source) source.connectionCount++
    if (target) target.connectionCount++
    const note = rec.value.note?.trim()
    if (!note || rec.pending) continue
    connectionEntries.push({
      kind: 'connection',
      id: rec.uri,
      type: rec.value.connectionType,
      note,
      sourceId: source?.id,
      targetId: target?.id,
      sourceTitle: source?.item.title ?? cleanUrl(rec.value.source),
      targetTitle: target?.item.title ?? cleanUrl(rec.value.target),
    })
  }

  return {
    cards,
    collections: groups.map((group) => ({ kind: 'collection', id: group.id, group })),
    connections: connectionEntries,
    cardsById,
    cardByUrl,
  }
}

export type SearchHit<E extends SearchEntry = SearchEntry> = {
  entry: E
  score: number
  /** Matched ranges in the entry's title (card title, collection name, connection note). */
  titleRanges: Range[]
  /** Why it matched, when that isn't the title: an excerpt with ranges. */
  detail?: { label: string; text: string; ranges: Range[] }
}

const CARD_DETAIL_LABEL: Record<string, string> = {
  description: 'Description',
  note: 'Note',
  margin: 'Margin note',
  url: 'URL',
}

function cardFields(e: CardEntry): Field[] {
  const { item } = e
  return [
    { key: 'title', text: item.title, weight: 1, fuzzy: true },
    { key: 'site', text: [item.siteName, item.domain].filter(Boolean).join(' '), weight: 0.8 },
    { key: 'url', text: item.url, weight: 0.6 },
    { key: 'description', text: item.kind === 'NOTE' ? undefined : item.description, weight: 0.5 },
    ...item.notes.map((text, i) => ({ key: `note:${i}`, text, weight: 0.55 })),
    ...e.marginNotes.map((text, i) => ({ key: `margin:${i}`, text, weight: 0.5 })),
  ]
}

function detailFor(fields: Field[], ranges: Record<string, Range[]>, best: string, labels: Record<string, string>) {
  if (best === 'title' || best === 'site') return undefined
  const field = fields.find((f) => f.key === best)
  if (!field?.text) return undefined
  const s = snippet(field.text, ranges[best] ?? [])
  return { label: labels[best.split(':')[0]!] ?? '', text: s.text, ranges: s.ranges }
}

/** Ranked matches per kind. An empty query returns nothing (the bar shows recents instead). */
export function search(index: SearchIndex, query: string) {
  const cards: SearchHit<CardEntry>[] = []
  const collections: SearchHit<CollectionEntry>[] = []
  const connections: SearchHit<ConnectionEntry>[] = []
  if (!query.trim()) return { cards, collections, connections }

  for (const entry of index.cards) {
    const fields = cardFields(entry)
    const m = matchFields(query, fields)
    if (!m) continue
    cards.push({
      entry,
      score: m.score,
      titleRanges: m.ranges.title ?? [],
      detail: detailFor(fields, m.ranges, m.best, CARD_DETAIL_LABEL),
    })
  }
  for (const entry of index.collections) {
    const fields: Field[] = [
      { key: 'title', text: entry.group.name, weight: 1, fuzzy: true },
      { key: 'description', text: entry.group.description, weight: 0.5 },
    ]
    const m = matchFields(query, fields)
    if (!m) continue
    collections.push({
      entry,
      score: m.score,
      titleRanges: m.ranges.title ?? [],
      detail: detailFor(fields, m.ranges, m.best, { description: 'Description' }),
    })
  }
  for (const entry of index.connections) {
    const fields: Field[] = [{ key: 'note', text: entry.note, weight: 0.6 }]
    const m = matchFields(query, fields)
    if (!m) continue
    const s = snippet(entry.note, m.ranges.note ?? [])
    connections.push({ entry, score: m.score, titleRanges: [], detail: { label: 'Note', text: s.text, ranges: s.ranges } })
  }

  const byScore = (a: SearchHit, b: SearchHit) => b.score - a.score
  cards.sort((a, b) => byScore(a, b) || a.entry.item.title.length - b.entry.item.title.length)
  collections.sort((a, b) => byScore(a, b) || a.entry.group.name.localeCompare(b.entry.group.name))
  connections.sort(byScore)
  return { cards, collections, connections }
}
