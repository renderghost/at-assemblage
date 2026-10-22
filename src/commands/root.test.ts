import type { GraphGroup, GraphItem } from '../graph/model'
import { DEFAULTS } from '../preferences/preferences'
import type { StoredRecord } from '../services/sources/records'
import type { CardRecord, CollectionLinkRecord, SembleLibrary } from '../services/sources/semble/types'
import { COMMAND_PROVIDERS } from './providers'
import { rootSections, type RootInput } from './root'
import { buildSearchIndex } from './searchIndex'
import type { CommandContext } from './types'

const CID = 'bafyreidmfvmmnzqxgkwexzt73uopc4kiycmdogbedw4ijduxobwvla6sua'
const DID = 'did:plc:testuser1234567890abcdef'
const uri = (coll: string, rkey: string) => `at://${DID}/${coll}/${rkey}`
const COLL = uri('network.cosmik.collection', 'a')
const groups: GraphGroup[] = [{ id: COLL, name: 'Urbanism', itemCount: 1 }]
const card = (rkey: string, url: string, title: string): StoredRecord<CardRecord> => ({
  uri: uri('network.cosmik.card', rkey),
  cid: CID,
  value: { $type: 'network.cosmik.card', type: 'URL', url, content: { $type: 'network.cosmik.card#urlContent', url, metadata: { title } } } as CardRecord,
})
const zoning = card('z', 'https://example.org/zoning', 'Zoning reform explained')
const library: SembleLibrary = {
  cards: [zoning],
  links: [
    {
      uri: uri('network.cosmik.collectionLink', 'l'),
      cid: CID,
      value: { $type: 'network.cosmik.collectionLink', collection: { uri: COLL, cid: CID }, card: { uri: zoning.uri, cid: CID }, addedBy: DID, addedAt: '2026-01-01T00:00:00.000Z' } as CollectionLinkRecord,
    },
  ],
  invalid: 0,
}

function context(over: Partial<CommandContext> = {}): CommandContext {
  const noop = () => {}
  return {
    index: buildSearchIndex({ library, groups }),
    groups,
    onCanvas: { items: new Set(), links: new Set(), groups: new Set() },
    selection: { cards: [], links: [], collections: [] },
    preferences: DEFAULTS,
    containers: true,
    collapsed: () => false,
    handle: 'alice.test',
    did: DID,
    filtering: false,
    sidebarOpen: true,
    flow: { fitView: noop, zoomIn: noop, zoomOut: noop, zoomTo100: noop },
    reveal: { card: noop, collection: noop, connection: noop },
    createConnection: noop,
    editConnection: noop,
    refetchAll: noop,
    signOut: noop,
    ...over,
  }
}

function input(ctx: CommandContext, query: string, over: Partial<RootInput> = {}): RootInput {
  return {
    ctx,
    commands: COMMAND_PROVIDERS.flatMap((p) => p(ctx)),
    recents: [],
    query,
    expanded: new Set(),
    loading: false,
    error: null,
    retry: () => {},
    url: null,
    ...over,
  }
}

const titles = (sections: ReturnType<typeof rootSections>) => sections.map((s) => s.title)

describe('command providers', () => {
  it('offers only the settings options you are not already on', () => {
    const ids = COMMAND_PROVIDERS.flatMap((p) => p(context({ preferences: { ...DEFAULTS, lineStyle: 'angled' } }))).map((c) => c.id)
    expect(ids).toContain('pref-lineStyle-curved')
    expect(ids).not.toContain('pref-lineStyle-angled')
    expect(ids).toContain('pref-showMinimap')
  })

  it('suggests actions for the selection', () => {
    const item = buildSearchIndex({ library, groups }).cards[0]!.item
    const other: GraphItem = { ...item, id: 'at://x/network.cosmik.card/other', title: 'Parking' }
    const one = COMMAND_PROVIDERS.flatMap((p) => p(context({ selection: { cards: [item], links: [], collections: [] } })))
    expect(one.filter((c) => c.section === 'Suggestions').map((c) => c.title)).toContain('Connect “Zoning reform explained” to…')
    const two = COMMAND_PROVIDERS.flatMap((p) => p(context({ selection: { cards: [item, other], links: [], collections: [] } })))
    expect(two.filter((c) => c.section === 'Suggestions').map((c) => c.title).slice(0, 2)).toEqual([
      'Connect “Zoning reform explained” → “Parking”…',
      'Connect “Parking” → “Zoning reform explained”…',
    ])
  })
})

describe('rootSections', () => {
  it('lists sections of commands for an empty query, and a getting-started section with no cards', () => {
    expect(titles(rootSections(input(context(), '')))).toEqual(['Create', 'Canvas', 'Settings', 'Help & account'])
    const empty = context({ index: buildSearchIndex({ library: { cards: [], links: [], invalid: 0 }, groups: [] }) })
    expect(titles(rootSections(input(empty, '')))[0]).toBe('Get started')
  })

  it('puts recents first, resolving cards and commands', () => {
    const sections = rootSections(input(context(), '', { recents: [`card:${zoning.uri}`, 'command:fit-view', 'card:gone'] }))
    expect(sections[0]!.title).toBe('Recent')
    expect(sections[0]!.rows.map((r) => r.title)).toEqual(['Zoning reform explained', 'Fit view'])
    // Not listed twice.
    expect(sections.find((s) => s.title === 'Canvas')!.rows.map((r) => r.title)).not.toContain('Fit view')
  })

  it('ranks commands and cards together', () => {
    expect(titles(rootSections(input(context(), 'fit')))[0]).toBe('Commands')
    expect(titles(rootSections(input(context(), 'zoning')))[0]).toBe('Cards')
  })

  it('offers to add a pasted link first, and falls back when nothing matches', () => {
    const sections = rootSections(input(context(), 'https://new.example/x', { url: { url: 'https://new.example/x', preview: null } }))
    expect(sections[0]!.title).toBe('Link')
    const none = rootSections(input(context(), 'qqzzx'))
    expect(none.map((s) => s.rows.map((r) => r.title))).toEqual([['New collection “qqzzx”…', 'Add a card…']])
  })

  it('shows loading and error states for library searches', () => {
    expect(rootSections(input(context(), 'zz', { loading: true })).at(-1)!.rows[0]!.title).toBe('Loading your library…')
    expect(rootSections(input(context(), 'zz', { error: new Error('x') })).at(-1)!.rows[0]!.title).toBe("Couldn't load your library. Retry")
  })
})
