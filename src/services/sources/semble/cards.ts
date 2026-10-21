import { TID } from '@atproto/common-web'
import { cidForLex } from '@atproto/lex-cbor'
import type { Client } from '@atproto/lex-client'
import { network } from '../../../lexicons'
import { collectionOf, rkeyOf } from '../../atproto/aturi'
import type { StoredRecord } from '../records'
import { normaliseUrl } from '../url'
import type { PlannedRecord } from './create'
import type { CardRecord, CollectionLinkRecord, CollectionRecord, ConnectionRecord, SembleLibrary } from './types'

export function cardUrl(card: CardRecord): string | undefined {
  return card.url ?? (network.cosmik.card.urlContent.isTypeOf(card.content) ? card.content.url : undefined)
}

export type CollectionChanges = {
  creates: PlannedRecord<CollectionLinkRecord>[]
  /** collectionLink AT URIs to delete. */
  deletes: string[]
}

/**
 * Diffs a card's collection memberships against the chosen set: new
 * `collectionLink` records for added collections, deletions for removed
 * ones. Semble indexes both, so the change shows in Semble.
 */
export async function planCollectionChanges(
  did: string,
  card: StoredRecord<CardRecord>,
  chosen: readonly StoredRecord<CollectionRecord>[],
  library: SembleLibrary,
  now = new Date(),
  nextTid: () => string = () => TID.nextStr(),
): Promise<CollectionChanges> {
  const current = library.links.filter((l) => l.value.card.uri === card.uri)
  const chosenIds = new Set(chosen.map((c) => c.uri))
  const linked = new Set<string>(current.map((l) => l.value.collection.uri))
  const timestamp = now.toISOString()
  const creates: PlannedRecord<CollectionLinkRecord>[] = []
  for (const collection of chosen) {
    if (linked.has(collection.uri)) continue
    const value = network.cosmik.collectionLink.$parse(
      network.cosmik.collectionLink.$build({
        collection: { uri: collection.uri as never, cid: collection.cid as never },
        card: { uri: card.uri as never, cid: card.cid as never },
        addedBy: did as never,
        addedAt: timestamp as never,
        createdAt: timestamp as never,
      }),
    )
    const rkey = nextTid()
    creates.push({
      rkey,
      uri: `at://${did}/network.cosmik.collectionLink/${rkey}`,
      cid: (await cidForLex(value as never)).toString(),
      value,
    })
  }
  const deletes = current.filter((l) => !chosenIds.has(l.value.collection.uri)).map((l) => l.uri)
  return { creates, deletes }
}

export type CardDeletion = {
  card: string
  notes: string[]
  links: string[]
  /** Connections whose source or target is this card (by AT URI or URL). */
  connections: string[]
}

/** Everything that belongs to a card: its note(s), its collection links and the connections touching it. */
export function planCardDeletion(
  card: StoredRecord<CardRecord>,
  library: SembleLibrary,
  connections: readonly StoredRecord<ConnectionRecord>[],
): CardDeletion {
  const url = cardUrl(card.value)
  const endpoints = new Set([card.uri, ...(url ? [normaliseUrl(url)] : [])])
  const touches = (endpoint: string) => endpoints.has(endpoint) || endpoints.has(normaliseUrl(endpoint))
  return {
    card: card.uri,
    notes: library.cards.filter((c) => c.value.parentCard?.uri === card.uri).map((c) => c.uri),
    links: library.links.filter((l) => l.value.card.uri === card.uri).map((l) => l.uri),
    connections: connections.filter((c) => touches(c.value.source) || touches(c.value.target)).map((c) => c.uri),
  }
}

const MAX_OPS_PER_COMMIT = 100

/**
 * Writes creates and deletes with `applyWrites`. Up to 100 operations go in
 * one atomic commit; larger sets are split, with the given order preserved
 * (callers put the most important deletes, e.g. the card itself, last).
 */
export async function applyRecordWrites(
  client: Client,
  creates: readonly PlannedRecord<CollectionLinkRecord>[],
  deletes: readonly string[],
): Promise<void> {
  type Op = { kind: 'create'; record: PlannedRecord<CollectionLinkRecord> } | { kind: 'delete'; uri: string }
  const ops: Op[] = [...creates.map((record) => ({ kind: 'create' as const, record })), ...deletes.map((uri) => ({ kind: 'delete' as const, uri }))]
  for (let i = 0; i < ops.length; i += MAX_OPS_PER_COMMIT) {
    const chunk = ops.slice(i, i + MAX_OPS_PER_COMMIT)
    await client.applyWrites((op) =>
      chunk.map((o) => {
        if (o.kind === 'create') {
          const { $type: _type, ...value } = o.record.value
          return op.create(network.cosmik.collectionLink, value, { rkey: o.record.rkey })
        }
        const rkey = rkeyOf(o.uri)
        switch (collectionOf(o.uri)) {
          case 'network.cosmik.card':
            return op.delete(network.cosmik.card, { rkey })
          case 'network.cosmik.collectionLink':
            return op.delete(network.cosmik.collectionLink, { rkey })
          case 'network.cosmik.connection':
            return op.delete(network.cosmik.connection, { rkey })
          default:
            throw new Error(`Unexpected record type in ${o.uri}`)
        }
      }),
    )
  }
}
