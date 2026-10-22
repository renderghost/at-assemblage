import { TEST_CID } from '../../../test/fakePds'
import { seedCollection, seedLink, seedUrlCard } from '../../../test/fixtures'
import { signedInFakePds } from '../../../test/withAuth'
import { fetchCollections, fetchLibrary } from './api'
import { applyRecordWrites } from './cards'
import { buildCollectionUpdate, planCollectionDeletion, updateCollection } from './collections'

describe('editing collections', () => {
  it('updates name, description and access in place, keeping createdAt and other fields', async () => {
    const { pds, auth } = await signedInFakePds()
    const uri = pds.putRecord('network.cosmik.collection', {
      name: 'Old',
      description: 'old',
      accessType: 'CLOSED',
      collaborators: ['did:plc:friend'],
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const stored = (await fetchCollections(auth.client, auth.did)).records.find((r) => r.uri === uri)!
    const saved = await updateCollection(auth.client, stored, { name: ' New name ', description: '', accessType: 'OPEN' })
    expect(saved.uri).toBe(uri)
    const after = (await fetchCollections(auth.client, auth.did)).records.find((r) => r.uri === uri)!.value
    expect(after).toMatchObject({ name: 'New name', accessType: 'OPEN', collaborators: ['did:plc:friend'], createdAt: '2026-01-01T00:00:00.000Z' })
    expect(after).not.toHaveProperty('description')
    expect(after.updatedAt).toBeTruthy()
  })

  it('refuses an update if the collection changed elsewhere', async () => {
    const { pds, auth } = await signedInFakePds()
    const uri = seedCollection(pds, 'A')
    const stored = (await fetchCollections(auth.client, auth.did)).records.find((r) => r.uri === uri)!
    pds.touch(uri)
    await expect(updateCollection(auth.client, stored, { name: 'B', accessType: 'CLOSED' })).rejects.toMatchObject({ error: 'InvalidSwap' })
  })

  it('enforces the lexicon limits', () => {
    const base = { $type: 'network.cosmik.collection' as const, name: 'A', accessType: 'CLOSED' }
    expect(() => buildCollectionUpdate(base, { name: 'x'.repeat(101), accessType: 'CLOSED' })).toThrow()
  })
})

describe('deleting collections', () => {
  it('removes the collection and its links in one commit, keeping the cards', async () => {
    const { pds, auth } = await signedInFakePds()
    const a = seedCollection(pds, 'A')
    const b = seedCollection(pds, 'B')
    const card = seedUrlCard(pds, 'https://example.com/a')
    seedLink(pds, a, card, TEST_CID)
    seedLink(pds, b, card, TEST_CID)
    const library = await fetchLibrary(auth.client, auth.did)
    await applyRecordWrites(auth.client, [], planCollectionDeletion(a, library))
    expect(pds.count('com.atproto.repo.applyWrites')).toBe(1)
    const after = await fetchLibrary(auth.client, auth.did)
    expect(after.cards.map((c) => c.uri)).toEqual([card])
    expect(after.links.map((l) => l.value.collection.uri)).toEqual([b])
    expect((await fetchCollections(auth.client, auth.did)).records.map((r) => r.uri)).toEqual([b])
  })
})
