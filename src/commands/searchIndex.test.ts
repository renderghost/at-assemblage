import type { GraphGroup } from '../graph/model'
import type { MarginNoteRecord } from '../services/sources/margin/notes'
import type { StoredRecord } from '../services/sources/records'
import type { CardRecord, CollectionLinkRecord, ConnectionRecord, SembleLibrary } from '../services/sources/semble/types'
import { buildSearchIndex, search } from './searchIndex'

const CID = 'bafyreidmfvmmnzqxgkwexzt73uopc4kiycmdogbedw4ijduxobwvla6sua'
const DID = 'did:plc:testuser1234567890abcdef'
const uri = (coll: string, rkey: string) => `at://${DID}/${coll}/${rkey}`
const COLL_A = uri('network.cosmik.collection', 'colla')
const COLL_B = uri('network.cosmik.collection', 'collb')
const groups: GraphGroup[] = [
  { id: COLL_A, name: 'Urbanism', description: 'Cities, streets and housing' },
  { id: COLL_B, name: 'Radio', description: 'Shows I like' },
]

const urlCard = (rkey: string, url: string, title: string): StoredRecord<CardRecord> => ({
  uri: uri('network.cosmik.card', rkey),
  cid: CID,
  value: {
    $type: 'network.cosmik.card',
    type: 'URL',
    url,
    content: { $type: 'network.cosmik.card#urlContent', url, metadata: { title } },
  } as CardRecord,
})
const noteCard = (rkey: string, text: string, parent: string): StoredRecord<CardRecord> => ({
  uri: uri('network.cosmik.card', rkey),
  cid: CID,
  value: {
    $type: 'network.cosmik.card',
    type: 'NOTE',
    content: { $type: 'network.cosmik.card#noteContent', text },
    parentCard: { uri: parent, cid: CID },
  } as CardRecord,
})
const link = (rkey: string, collection: string, card: string): StoredRecord<CollectionLinkRecord> => ({
  uri: uri('network.cosmik.collectionLink', rkey),
  cid: CID,
  value: {
    $type: 'network.cosmik.collectionLink',
    collection: { uri: collection, cid: CID },
    card: { uri: card, cid: CID },
    addedBy: DID,
    addedAt: '2026-01-01T00:00:00.000Z',
  } as CollectionLinkRecord,
})
const connection = (rkey: string, source: string, target: string, note?: string): StoredRecord<ConnectionRecord> => ({
  uri: uri('network.cosmik.connection', rkey),
  cid: CID,
  value: { $type: 'network.cosmik.connection', source, target, connectionType: 'SUPPORTS', ...(note ? { note } : {}) } as ConnectionRecord,
})
const margin = (rkey: string, url: string, text: string) =>
  ({ uri: uri('at.margin.note', rkey), cid: CID, value: { target: { source: url }, body: { value: text } } }) as unknown as StoredRecord<MarginNoteRecord>

const zoning = urlCard('zoning', 'https://example.org/zoning', 'Zoning reform explained')
const parking = urlCard('parking', 'https://www.parking.example/high-cost', 'The High Cost of Free Parking')
const radio = urlCard('radio', 'https://radio.example/', 'radioghost')
const unfiled = urlCard('unfiled', 'https://unfiled.example/', 'Loose page')

const library: SembleLibrary = {
  cards: [zoning, parking, radio, unfiled, noteCard('n1', 'Great primer on setback rules', zoning.uri)],
  links: [link('l1', COLL_A, zoning.uri), link('l2', COLL_A, parking.uri), link('l3', COLL_B, radio.uri), link('l4', COLL_B, parking.uri)],
  invalid: 0,
}
const connections = {
  connections: [
    connection('c1', 'https://example.org/zoning', parking.uri, 'Both argue minimums distort land use'),
    connection('c2', radio.uri, 'https://elsewhere.example/x'),
  ],
  invalid: 0,
}
const index = buildSearchIndex({
  library,
  groups,
  connections,
  marginNotes: [margin('m1', 'https://www.parking.example/high-cost/', 'Shoup on cruising for parking')],
})

describe('buildSearchIndex', () => {
  it('indexes every top-level card in the library, with all its collections, notes and connection count', () => {
    expect(index.cards.map((c) => c.item.title)).toEqual(['Zoning reform explained', 'The High Cost of Free Parking', 'radioghost', 'Loose page'])
    const p = index.cardsById.get(parking.uri)!
    expect(p.collectionIds).toEqual([COLL_A, COLL_B])
    expect(p.marginNotes).toEqual(['Shoup on cruising for parking'])
    expect(p.connectionCount).toBe(1)
    expect(index.cardsById.get(zoning.uri)!.item.notes).toEqual(['Great primer on setback rules'])
    expect(index.cardsById.get(unfiled.uri)!.collectionIds).toEqual([])
  })

  it('indexes only connections with notes, resolving ends by URL or AT URI', () => {
    expect(index.connections).toHaveLength(1)
    expect(index.connections[0]).toMatchObject({ sourceId: zoning.uri, targetId: parking.uri, sourceTitle: 'Zoning reform explained' })
  })

  it('finds a card by its URL', () => {
    expect(index.cardByUrl.get('https://www.parking.example/high-cost')).toBe(parking.uri)
  })
})

describe('search', () => {
  it('ranks title matches above note matches and explains non-title matches', () => {
    const { cards } = search(index, 'parking')
    expect(cards[0]!.entry.id).toBe(parking.uri)
    expect(cards[0]!.titleRanges).toEqual([[22, 29]])
  })

  it('finds cards by Semble note and Margin note, with an excerpt', () => {
    const bySemble = search(index, 'setback').cards
    expect(bySemble.map((h) => h.entry.id)).toEqual([zoning.uri])
    expect(bySemble[0]!.detail).toMatchObject({ label: 'Note', text: 'Great primer on setback rules' })
    const byMargin = search(index, 'shoup').cards
    expect(byMargin[0]!.detail?.label).toBe('Margin note')
  })

  it('finds collections by name or description, and connections by note', () => {
    expect(search(index, 'housing').collections.map((h) => h.entry.group.name)).toEqual(['Urbanism'])
    expect(search(index, 'land use').connections.map((h) => h.entry.id)).toEqual([connections.connections[0]!.uri])
  })

  it('matches letters in order in titles only', () => {
    expect(search(index, 'rdghst').cards.map((h) => h.entry.id)).toEqual([radio.uri])
    expect(search(index, '').cards).toEqual([])
  })
})
