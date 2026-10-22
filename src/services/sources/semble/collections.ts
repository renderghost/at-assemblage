import type { Client } from '@atproto/lex-client'
import { network } from '../../../lexicons'
import { rkeyOf } from '../../atproto/aturi'
import type { StoredRecord } from '../records'
import type { NewCollectionInput } from './create'
import type { CollectionRecord, SembleLibrary } from './types'

/**
 * Edits what Semble's own update supports: name, description and access
 * type. Everything else on the record (createdAt, collaborators) is kept;
 * `updatedAt` is set to now. Semble's indexer applies collection updates.
 */
export function buildCollectionUpdate(existing: CollectionRecord, input: NewCollectionInput, now = new Date()): CollectionRecord {
  const { description: _old, ...rest } = existing
  const description = input.description?.trim()
  return network.cosmik.collection.$parse({
    ...rest,
    name: input.name.trim(),
    ...(description ? { description } : {}),
    accessType: input.accessType,
    updatedAt: now.toISOString(),
  })
}

/** Rewrites the collection in place; refused if it changed elsewhere since it was loaded. */
export async function updateCollection(
  client: Client,
  existing: StoredRecord<CollectionRecord>,
  input: NewCollectionInput,
): Promise<StoredRecord<CollectionRecord>> {
  const record = buildCollectionUpdate(existing.value, input)
  const { $type: _type, ...value } = record
  const { uri, cid } = await client.put(network.cosmik.collection, value, { rkey: rkeyOf(existing.uri), swapRecord: existing.cid })
  return { uri, cid, value: record }
}

/**
 * Deleting a collection removes the collection record and your links to it.
 * Cards stay in your library (and any other collections). The collection is
 * deleted last, so a split batch never leaves it without its links removed.
 */
export function planCollectionDeletion(collectionUri: string, library: SembleLibrary): string[] {
  const links = library.links.filter((l) => l.value.collection.uri === collectionUri).map((l) => l.uri)
  return [...links, collectionUri]
}
