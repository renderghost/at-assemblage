import { cleanUrl, normaliseUrl } from '../services/sources/url'
import { useUiStore } from '../state/uiStore'
import { cardRow, collectionRow, commandRow, connectionRow, searchSections } from './entities'
import { matchFields } from './match'
import type { Command, CommandContext, CommandSection, Row, Section } from './types'

const LISTED_ORDER: CommandSection[] = ['Create', 'Canvas', 'Settings', 'Help & account']

export type RootInput = {
  ctx: CommandContext
  commands: Command[]
  /** Frecency-ranked keys, best first. */
  recents: string[]
  query: string
  expanded: Set<string>
  loading: boolean
  error: unknown
  retry: () => void
  /** A URL typed or pasted into the field, with its link preview if fetched. */
  url: { url: string; preview: { title?: string; description?: string; imageUrl?: string } | null } | null
}

function recentRow(key: string, { ctx, commands }: RootInput): Row | undefined {
  const [kind, ...rest] = key.split(':')
  const id = rest.join(':')
  if (kind === 'command') {
    const cmd = commands.find((c) => c.id === id && c.section !== 'Suggestions')
    return cmd ? commandRow(cmd) : undefined
  }
  if (kind === 'card') {
    const entry = ctx.index.cardsById.get(id)
    return entry ? cardRow(entry, ctx) : undefined
  }
  if (kind === 'collection') {
    const entry = ctx.index.collections.find((c) => c.id === id)
    return entry ? collectionRow(entry, ctx) : undefined
  }
  if (kind === 'connection') {
    const entry = ctx.index.connections.find((c) => c.id === id)
    return entry ? connectionRow(entry, ctx) : undefined
  }
  return undefined
}

/** Commands matching a query: title first, then keywords and section. */
function matchCommands(commands: Command[], query: string): { row: Row; score: number }[] {
  return commands
    .map((cmd) => ({
      cmd,
      m: matchFields(query, [
        { key: 'title', text: cmd.title, weight: 1, fuzzy: true },
        { key: 'keywords', text: cmd.keywords?.join(' '), weight: 0.7 },
        { key: 'section', text: cmd.section, weight: 0.4 },
      ]),
    }))
    .filter((x) => x.m)
    .sort((a, b) => b.m!.score - a.m!.score)
    .map(({ cmd, m }) => ({ row: { ...commandRow(cmd), titleRanges: m!.ranges.title }, score: m!.score }))
}

/** The bar's first page: suggestions, recents and commands; or search results for a query. */
export function rootSections(input: RootInput): Section[] {
  const { ctx, commands, query, expanded, loading, error, retry, url } = input
  const q = query.trim()
  const sections: Section[] = []

  if (!q) {
    const suggestions = commands.filter((c) => c.section === 'Suggestions')
    if (suggestions.length) sections.push({ id: 'suggestions', title: 'Suggestions', rows: suggestions.map(commandRow) })
    if (!loading && !error && ctx.index.cards.length === 0) {
      sections.push({
        id: 'start',
        title: 'Get started',
        rows: [
          { ...commandRow(commands.find((c) => c.id === 'new-card')!), title: 'Add your first card…' },
          { ...commandRow(commands.find((c) => c.id === 'new-collection')!), title: 'Create a collection…' },
        ],
      })
    }
    const shown = new Set(sections.flatMap((s) => s.rows.map((r) => r.id)))
    const recent = input.recents
      .map((key) => recentRow(key, input))
      .filter((r): r is Row => !!r && !shown.has(r.id))
      .slice(0, 5)
    if (recent.length) sections.push({ id: 'recent', title: 'Recent', rows: recent })
    for (const r of recent) shown.add(r.id)
    for (const section of LISTED_ORDER) {
      const rows = commands.filter((c) => c.section === section && c.listed).map(commandRow).filter((r) => !shown.has(r.id))
      if (rows.length) sections.push({ id: section, title: section, rows })
    }
    return sections
  }

  const scored: { section: Section; score: number }[] = []

  if (url) {
    const existingId = ctx.index.cardByUrl.get(normaliseUrl(url.url))
    const existing = existingId ? ctx.index.cardsById.get(existingId) : undefined
    const rows: Row[] = []
    if (existing) rows.push({ ...cardRow(existing, ctx), badge: 'In your library' })
    rows.push({
      id: 'add-url',
      icon: { kind: 'icon', name: 'plus' },
      title: existing ? `Add “${existing.item.title}” to more collections…` : `Add card: ${cleanUrl(url.url)}`,
      subtitle: url.preview?.title,
      preview: { kind: 'url', url: url.url, existing },
      run: () =>
        useUiStore.getState().openAddCard({
          url: url.url,
          title: url.preview?.title,
          description: url.preview?.description,
          imageUrl: url.preview?.imageUrl,
        }),
      runLabel: 'Add card',
    })
    scored.push({ section: { id: 'url', title: 'Link', rows }, score: 1000 })
  }

  const cmdHits = matchCommands(commands, q)
  if (cmdHits.length) {
    const all = expanded.has('commands')
    const rows = cmdHits.map((h) => h.row)
    scored.push({
      section: { id: 'commands', title: 'Commands', rows: all ? rows : rows.slice(0, 5), more: all ? undefined : rows.slice(5) },
      // A command whose title starts with the query should come first ("fit" → Fit view).
      score: cmdHits[0]!.score + 5,
    })
  }

  // The card a pasted link belongs to is already listed under Link.
  const shownIds = new Set(scored.flatMap((x) => x.section.rows.map((r) => r.id)))
  for (const found of searchSections(ctx, q, expanded)) {
    const rows = found.section.rows.filter((r) => !shownIds.has(r.id))
    if (rows.length) scored.push({ ...found, section: { ...found.section, rows } })
  }
  scored.sort((a, b) => b.score - a.score)
  sections.push(...scored.map((s) => s.section))

  if (loading) {
    sections.push({
      id: 'loading',
      title: 'Cards',
      rows: [{ id: 'loading', icon: { kind: 'icon', name: 'refresh' }, title: 'Loading your library…', disabled: true }],
    })
  } else if (error) {
    sections.push({
      id: 'error',
      title: 'Cards',
      rows: [
        {
          id: 'retry',
          icon: { kind: 'icon', name: 'warning' },
          title: "Couldn't load your library. Retry",
          run: () => {
            retry()
            return 'stay'
          },
          runLabel: 'Retry',
        },
      ],
    })
  }

  if (sections.length === 0) {
    sections.push({
      id: 'fallback',
      title: `No results for “${q}”`,
      rows: [
        {
          id: 'fallback-collection',
          icon: { kind: 'icon', name: 'collection' },
          title: `New collection “${q}”…`,
          run: () => useUiStore.getState().openNewCollection({ name: q.slice(0, 100) }),
          runLabel: 'Create',
        },
        {
          id: 'fallback-card',
          icon: { kind: 'icon', name: 'plus' },
          title: 'Add a card…',
          subtitle: 'Paste a link here to add it straight away',
          run: () => useUiStore.getState().openAddCard(),
          runLabel: 'Add card',
        },
      ],
    })
  }
  return sections
}
