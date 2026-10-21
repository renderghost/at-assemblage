import { TEST_CID } from '../../../test/fakePds'
import { C, seedCollection, seedLink, seedUrlCard } from '../../../test/fixtures'
import { signedInFakePds } from '../../../test/withAuth'
import { fetchCollections, fetchConnections, fetchLibrary } from './api'
import { applyRecordWrites, planCardDeletion, planCollectionChanges } from './cards'

async function setup() {
  const { pds, auth } = await signedInFakePds()
  const a = seedCollection(pds, 'A')
  const b = seedCollection(pds, 'B')
  const cardUri = seedUrlCard(pds, 'https://example.com/a', 'A page')
  const other = seedUrlCard(pds, 'https://example.com/b')
  seedLink(pds, a, cardUri, TEST_CID)
  seedLink(pds, a, other, TEST_CID)
  pds.putRecord(C.card, { type: 'NOTE', content: { $type: 'network.cosmik.card#noteContent', text: 'n' }, parentCard: { uri: cardUri, cid: TEST_CID } })
  pds.putRecord(C.connection, { source: 'https://example.com/a', target: 'https://example.com/b', connectionType: 'RELATED' })
  pds.putRecord(C.connection, { source: other, target: cardUri, connectionType: 'SUPPORTS' })
  pds.putRecord(C.connection, { source: 'https://example.com/b', target: 'https://x.example', connectionType: 'RELATED' })
  const library = await fetchLibrary(auth.client, auth.did)
  const collections = (await fetchCollections(auth.client, auth.did)).records
  return { pds, auth, library, card: library.cards.find((c) => c.uri === cardUri)!, a: collections.find((c) => c.uri === a)!, b: collections.find((c) => c.uri === b)! }
}

describe('card collections', () => {
  it('adds and removes collection links in one commit', async () => {
    const { pds, auth, library, card, b } = await setup()
    const changes = await planCollectionChanges(auth.did, card, [b], library)
    expect(changes.creates.map((c) => c.value.collection.uri)).toEqual([b.uri])
    expect(changes.deletes).toHaveLength(1)
    await applyRecordWrites(auth.client, changes.creates, changes.deletes)
    expect(pds.count('com.atproto.repo.applyWrites')).toBe(1)
    const after = await fetchLibrary(auth.client, auth.did)
    expect(after.links.filter((l) => l.value.card.uri === card.uri).map((l) => l.value.collection.uri)).toEqual([b.uri])
  })

  it('does nothing when the set is unchanged', async () => {
    const { auth, library, card, a } = await setup()
    expect(await planCollectionChanges(auth.did, card, [a], library)).toEqual({ creates: [], deletes: [] })
  })
})

describe('card deletion', () => {
  it('finds the note, links and connections touching the card by URL or AT URI', async () => {
    const { auth, library, card } = await setup()
    const { connections } = await fetchConnections(auth.client, auth.did)
    const plan = planCardDeletion(card, library, connections)
    expect(plan.notes).toHaveLength(1)
    expect(plan.links).toHaveLength(1)
    expect(plan.connections).toHaveLength(2)
  })

  it('deletes them together, leaving unrelated records', async () => {
    const { pds, auth, library, card } = await setup()
    const { connections } = await fetchConnections(auth.client, auth.did)
    const plan = planCardDeletion(card, library, connections)
    await applyRecordWrites(auth.client, [], [...plan.connections, ...plan.links, ...plan.notes, plan.card])
    expect(pds.count('com.atproto.repo.applyWrites')).toBe(1)
    const after = await fetchLibrary(auth.client, auth.did)
    expect(after.cards.map((c) => c.uri)).not.toContain(card.uri)
    expect(after.cards.some((c) => c.value.parentCard)).toBe(false)
    expect(after.links).toHaveLength(1)
    expect((await fetchConnections(auth.client, auth.did)).connections).toHaveLength(1)
  })
})
