import { sembleCollectionPage, sembleUrlPage } from '../components/workspace/ContextMenu'
import type { GraphGroup, GraphItem } from '../graph/model'
import { CONNECTION_TYPES, styleForType, typeInfo } from '../services/sources/semble/connectionTypes'
import { isHttpUrl } from '../services/sources/url'
import { useUiStore } from '../state/uiStore'
import { matchFields } from './match'
import { search, type CardEntry, type CollectionEntry, type ConnectionEntry, type SearchHit } from './searchIndex'
import type { Command, CommandContext, Row, Section, View } from './types'

/** Connection notes are limited to 1000 characters by the lexicon. */
export const CONNECTION_NOTE_MAX = 1000

export function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function copyText(text: string, what: string) {
  const { notify } = useUiStore.getState()
  try {
    await navigator.clipboard.writeText(text)
    notify({ tone: 'success', message: `${what} copied.` })
  } catch {
    notify({ tone: 'error', message: `Couldn't copy the ${what.toLowerCase()}.` })
  }
}

export function commandRow(cmd: Command): Row {
  return {
    id: `command:${cmd.id}`,
    icon: { kind: 'icon', name: cmd.icon },
    title: cmd.title,
    subtitle: cmd.subtitle,
    shortcut: cmd.shortcut,
    preview: { kind: 'command', icon: cmd.icon, title: cmd.title, description: cmd.description, shortcut: cmd.shortcut, current: cmd.subtitle },
    run: cmd.run,
    runLabel: cmd.runLabel ?? 'Run',
    recentKey: `command:${cmd.id}`,
    danger: cmd.danger,
  }
}

/** Filters rows by title for views that list a fixed set (actions, types). */
export function filterRows(rows: Row[], query: string): Row[] {
  if (!query.trim()) return rows
  return rows
    .map((row) => ({ row, m: matchFields(query, [{ key: 'title', text: row.title, weight: 1, fuzzy: true }, { key: 'sub', text: row.subtitle, weight: 0.6 }]) }))
    .filter((x) => x.m)
    .sort((a, b) => b.m!.score - a.m!.score)
    .map(({ row, m }) => ({ ...row, titleRanges: m!.ranges.title }))
}

/** A view listing a row's actions (⌘K). */
export function actionsView(row: Row): View {
  return {
    id: `actions:${row.id}`,
    chip: row.title,
    placeholder: 'Search actions…',
    // The card (or collection, or connection) stays in the preview and spotlight while you pick.
    sections: (q) => [
      {
        id: 'actions',
        title: 'Actions',
        rows: filterRows(row.actions?.() ?? [], q).map((a) => ({ ...a, preview: row.preview ?? a.preview, spotlight: row.spotlight })),
      },
    ],
  }
}

function collectionNames(ctx: CommandContext, ids: string[]): string[] {
  const byId = new Map(ctx.groups.map((g) => [g.id, g.name]))
  return ids.map((id) => byId.get(id)).filter((n): n is string => !!n)
}

// ——— Cards ———

export function cardActions(entry: CardEntry, ctx: CommandContext): Command[] {
  const { item } = entry
  const s = useUiStore.getState
  const onCanvas = ctx.onCanvas.items.has(entry.id)
  const cmds: Command[] = []
  if (onCanvas || entry.collectionIds.length) {
    cmds.push({
      id: 'show',
      title: onCanvas ? 'Select on canvas' : 'Show on canvas',
      section: 'Suggestions',
      icon: 'focus',
      run: () => ctx.reveal.card(entry),
    })
  }
  cmds.push({ id: 'connect', title: 'Connect to…', section: 'Suggestions', icon: 'link', run: () => ({ push: connectTargetView(item, ctx) }) })
  const other = ctx.selection.cards.length === 1 ? ctx.selection.cards[0] : undefined
  if (other && other.id !== entry.id) {
    cmds.push({
      id: 'connect-from-selection',
      title: `Connect “${other.title}” to this…`,
      section: 'Suggestions',
      icon: 'arrowRight',
      run: () => ({ push: typeView(other, item, ctx) }),
    })
  }
  if (item.url && isHttpUrl(item.url)) {
    const url = item.url
    cmds.push({ id: 'open', title: 'Open page', section: 'Suggestions', icon: 'external', run: () => openUrl(url) })
    cmds.push({ id: 'semble', title: 'View on Semble', section: 'Suggestions', icon: 'link', run: () => openUrl(sembleUrlPage(url)) })
    cmds.push({ id: 'copy', title: 'Copy URL', section: 'Suggestions', icon: 'copy', run: () => void copyText(url, 'URL') })
  }
  cmds.push({ id: 'edit', title: 'Edit card…', section: 'Suggestions', icon: 'pencil', run: () => s().setEditCardId(entry.id) })
  cmds.push({ id: 'delete', title: 'Delete card…', section: 'Suggestions', icon: 'trash', danger: true, run: () => s().setDeleteCardId(entry.id) })
  return cmds
}

export function cardRow(entry: CardEntry, ctx: CommandContext, hit?: SearchHit): Row {
  const { item } = entry
  const onCanvas = ctx.onCanvas.items.has(entry.id)
  const names = collectionNames(ctx, entry.collectionIds)
  const where = names.length ? names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '') : 'Not in a collection'
  const placeable = onCanvas || entry.collectionIds.length > 0
  const actions = () => cardActions(entry, ctx).map((c) => ({ ...commandRow(c), id: `card-action:${c.id}`, recentKey: undefined }))
  return {
    id: `card:${entry.id}`,
    icon: { kind: 'site', domain: item.domain, note: item.kind === 'NOTE' },
    title: item.title,
    titleRanges: hit?.titleRanges,
    subtitle: [item.siteName ?? item.domain, where].filter(Boolean).join(' · '),
    detail: hit?.detail,
    badge: onCanvas ? 'On canvas' : undefined,
    preview: { kind: 'card', entry, onCanvas },
    // Outside cards are on the canvas too, just not "in" it; the preview checks what's really there.
    spotlight: { nodes: [entry.id], edges: [] },
    // A card in no collection can't be shown, so Enter offers its actions instead.
    run: placeable ? () => ctx.reveal.card(entry) : () => ({ push: actionsView({ id: `card:${entry.id}`, title: item.title, icon: { kind: 'icon', name: 'note' }, actions }) }),
    runLabel: placeable ? (onCanvas ? 'Select' : 'Show on canvas') : 'Actions',
    actions,
    recentKey: `card:${entry.id}`,
  }
}

// ——— Collections ———

export function collectionActions(group: GraphGroup, ctx: CommandContext): Command[] {
  const s = useUiStore.getState
  const shown = ctx.onCanvas.groups.has(group.id)
  const cmds: Command[] = [
    { id: 'show', title: shown ? 'Zoom to it' : 'Show on canvas', section: 'Suggestions', icon: 'focus', run: () => ctx.reveal.collection(group.id) },
  ]
  if (shown) {
    cmds.push({ id: 'hide', title: 'Hide from canvas', section: 'Suggestions', icon: 'close', run: () => s().toggleGroup(group.id) })
  }
  if (!shown || ctx.onCanvas.groups.size > 1) {
    cmds.push({
      id: 'only',
      title: 'Show only this collection',
      section: 'Suggestions',
      icon: 'collection',
      run: () => {
        s().setSelectedGroupIds([group.id])
        ctx.reveal.collection(group.id)
      },
    })
  }
  if (shown && ctx.containers) {
    const collapsed = ctx.collapsed(group.id)
    cmds.push({
      id: 'collapse',
      title: collapsed ? 'Expand' : 'Collapse',
      section: 'Suggestions',
      icon: collapsed ? 'expand' : 'collapse',
      run: () => s().toggleCollapsed(group.id),
    })
    if (!collapsed) cmds.push({ id: 'fit', title: 'Fit to cards', section: 'Suggestions', icon: 'fit', run: () => s().requestFitCollection(group.id) })
  }
  cmds.push(
    { id: 'new-card', title: `New card in “${group.name}”…`, section: 'Suggestions', icon: 'plus', run: () => s().openAddCard({ collectionIds: [group.id] }) },
    { id: 'edit', title: 'Edit collection…', section: 'Suggestions', icon: 'pencil', run: () => s().setEditCollectionId(group.id) },
    { id: 'semble', title: 'View on Semble', section: 'Suggestions', icon: 'link', run: () => openUrl(sembleCollectionPage(ctx.handle, group.id)) },
    { id: 'delete', title: 'Delete collection…', section: 'Suggestions', icon: 'trash', danger: true, run: () => s().setDeleteCollectionId(group.id) },
  )
  return cmds
}

export function collectionRow(entry: CollectionEntry, ctx: CommandContext, hit?: SearchHit): Row {
  const { group } = entry
  const shown = ctx.onCanvas.groups.has(group.id)
  const count = group.itemCount ?? 0
  return {
    id: `collection:${group.id}`,
    icon: { kind: 'icon', name: 'collection' },
    title: group.name,
    titleRanges: hit?.titleRanges,
    subtitle: `${count} card${count === 1 ? '' : 's'} · ${group.accessType === 'OPEN' ? 'Open' : 'Personal'}`,
    detail: hit?.detail,
    badge: shown ? 'On canvas' : undefined,
    preview: { kind: 'collection', entry, shown },
    spotlight: shown && ctx.containers ? { nodes: [group.id], edges: [] } : undefined,
    run: () => ctx.reveal.collection(group.id),
    runLabel: shown ? 'Zoom to it' : 'Show on canvas',
    actions: () => collectionActions(group, ctx).map((c) => ({ ...commandRow(c), id: `collection-action:${c.id}`, recentKey: undefined })),
    recentKey: `collection:${group.id}`,
  }
}

// ——— Connections ———

type LinkInfo = { id: string; type?: string; note?: string; sourceId?: string; targetId?: string; sourceTitle: string; targetTitle: string }

export function connectionActions(link: LinkInfo, ctx: CommandContext): Command[] {
  const onCanvas = ctx.onCanvas.links.has(link.id)
  const label = styleForType(link.type).label
  return [
    { id: 'show', title: onCanvas ? 'Select on canvas' : 'Show on canvas', section: 'Suggestions', icon: 'focus', run: () => ctx.reveal.connection(link) },
    {
      id: 'type',
      title: 'Change type…',
      section: 'Suggestions',
      icon: 'swap',
      subtitle: `Now: ${label}`,
      run: () => ({
        push: typePickerView({
          chip: `Change ${label}`,
          current: typeInfo(link.type)?.value,
          onPick: (type) => ctx.editConnection(link.id, { type }),
        }),
      }),
    },
    {
      id: 'reverse',
      title: 'Reverse direction',
      section: 'Suggestions',
      icon: 'swap',
      subtitle: `${link.targetTitle} → ${link.sourceTitle}`,
      run: () => ctx.editConnection(link.id, { reverse: true }),
    },
    {
      id: 'note',
      title: link.note ? 'Edit note…' : 'Add a note…',
      section: 'Suggestions',
      icon: 'note',
      run: () => ({ push: connectionNoteView(link, ctx) }),
    },
    {
      id: 'delete',
      title: 'Delete connection…',
      section: 'Suggestions',
      icon: 'trash',
      danger: true,
      run: () => {
        // The delete dialog needs the connection on the canvas; it opens once it appears.
        if (!onCanvas) ctx.reveal.connection(link)
        useUiStore.getState().requestDeleteLinks([link.id])
      },
    },
  ]
}

export function connectionRow(entry: ConnectionEntry, ctx: CommandContext, hit?: SearchHit): Row {
  const onCanvas = ctx.onCanvas.links.has(entry.id)
  const style = styleForType(entry.type)
  return {
    id: `connection:${entry.id}`,
    icon: { kind: 'type', type: entry.type },
    title: `${entry.sourceTitle} → ${entry.targetTitle}`,
    subtitle: style.label,
    detail: hit?.detail,
    badge: onCanvas ? 'On canvas' : undefined,
    preview: { kind: 'connection', link: entry, onCanvas },
    spotlight: onCanvas ? { nodes: [entry.sourceId, entry.targetId].filter((x): x is string => !!x), edges: [entry.id] } : undefined,
    run: () => ctx.reveal.connection(entry),
    runLabel: onCanvas ? 'Select' : 'Show on canvas',
    actions: () => connectionActions(entry, ctx).map((c) => ({ ...commandRow(c), id: `connection-action:${c.id}`, recentKey: undefined })),
    recentKey: `connection:${entry.id}`,
  }
}

function connectionNoteView(link: LinkInfo, ctx: CommandContext): View {
  return {
    id: `connection-note:${link.id}`,
    chip: 'Note',
    placeholder: link.note ? 'Edit the note, then press Enter' : 'Type a note, then press Enter',
    mode: 'text',
    textLimit: CONNECTION_NOTE_MAX,
    submitLabel: 'Save note',
    sections: () => [],
    preview: (text) => ({ kind: 'connection', link: { ...link, note: text }, onCanvas: false, draft: 'Enter saves the note to your PDS.' }),
    submit: (text) => ctx.editConnection(link.id, { note: text }),
  }
}

// ——— Connecting from the keyboard ———

/** Step 1: choose the card to connect to, from the whole library. */
export function connectTargetView(source: GraphItem, ctx: CommandContext): View {
  return {
    id: `connect:${source.id}`,
    chip: `Connect “${source.title}” to`,
    placeholder: 'Search your cards…',
    sections: (q) => {
      const hits = q.trim()
        ? search(ctx.index, q).cards
        : ctx.index.cards.filter((c) => ctx.onCanvas.items.has(c.id)).map((entry) => ({ entry, score: 0, titleRanges: [] }))
      const rows = hits
        .filter((h) => h.entry.id !== source.id)
        .slice(0, 40)
        .map((h): Row => {
          const base = cardRow(h.entry, ctx, h)
          return {
            ...base,
            run: () => ({ push: typeView(source, h.entry.item, ctx) }),
            runLabel: 'Choose',
            actions: undefined,
            recentKey: undefined,
          }
        })
      return [{ id: 'targets', title: q.trim() ? 'Cards' : 'On the canvas', rows }]
    },
    empty: (q) => ({ title: q.trim() ? `No cards match “${q.trim()}”` : 'Search for a card to connect to' }),
  }
}

/** A list of Semble's connection types. */
function typePickerView({
  chip,
  current,
  pair,
  onPick,
}: {
  chip: string
  current?: string
  pair?: View['pair']
  onPick: (type: string) => void | View
}): View {
  return {
    id: `type:${chip}`,
    chip,
    placeholder: 'Choose a type…',
    pair,
    sections: (q, live) => {
      const rec = live.recommendation
      const rows = CONNECTION_TYPES.map((t): Row => ({
        id: `type:${t.value}`,
        icon: { kind: 'type', type: t.value },
        title: t.label,
        subtitle: t.description,
        badge: t.value === current ? 'Current' : rec?.type === t.value ? 'Recommended' : undefined,
        preview: { kind: 'type', type: t.value, reason: rec?.type === t.value ? rec.reason : undefined },
        run: () => {
          const next = onPick(t.value)
          return next ? { push: next } : undefined
        },
        runLabel: 'Choose',
      }))
      return [{ id: 'types', title: 'Connection types', rows: filterRows(rows, q) }]
    },
    initialRowId: (live) => {
      const prefs = useUiStore.getState().preferences
      if (current) return `type:${current}`
      const preselect = prefs.recommendedType === 'preselect' ? live.recommendation?.type : undefined
      return `type:${preselect ?? prefs.defaultConnectionType}`
    },
  }
}

/** Step 2: the type (recommended one marked). Step 3: an optional note, then save. */
export function typeView(source: GraphItem, target: GraphItem, ctx: CommandContext): View {
  return typePickerView({
    chip: `${source.title} → ${target.title}`,
    pair: { source, target },
    onPick: (type) => connectNoteView(source, target, type, ctx),
  })
}

function connectNoteView(source: GraphItem, target: GraphItem, type: string, ctx: CommandContext): View {
  return {
    id: `connect-note:${source.id}:${target.id}:${type}`,
    chip: styleForType(type).label,
    placeholder: 'Add a note (optional), then press Enter to save',
    mode: 'text',
    textLimit: CONNECTION_NOTE_MAX,
    submitLabel: 'Save connection',
    sections: () => [],
    preview: (note) => ({
      kind: 'connection',
      link: { type, note, sourceTitle: source.title, targetTitle: target.title },
      onCanvas: false,
      draft: 'Enter saves this connection to your PDS. The note is optional.',
    }),
    submit: (note) => ctx.createConnection(source, target, type, note),
  }
}

/** Default connection type from the bar: same list, saved as a preference. */
export function defaultTypeView(): View {
  return typePickerView({
    chip: 'Default connection type',
    current: useUiStore.getState().preferences.defaultConnectionType,
    onPick: (type) => useUiStore.getState().setPreference('defaultConnectionType', type),
  })
}

/** Sections for a search across cards, collections and connections, each with its best score. */
export function searchSections(ctx: CommandContext, q: string, expanded: Set<string>): { section: Section; score: number }[] {
  const hits = search(ctx.index, q)
  const out: { section: Section; score: number }[] = []
  const add = (id: string, title: string, rows: Row[], limit: number, score: number) => {
    if (!rows.length) return
    const all = expanded.has(id)
    out.push({ section: { id, title, rows: all ? rows : rows.slice(0, limit), more: all ? undefined : rows.slice(limit) }, score })
  }
  add('cards', 'Cards', hits.cards.map((h) => cardRow(h.entry, ctx, h)), 6, hits.cards[0]?.score ?? 0)
  add('collections', 'Collections', hits.collections.map((h) => collectionRow(h.entry, ctx, h)), 4, hits.collections[0]?.score ?? 0)
  add('connections', 'Connections', hits.connections.map((h) => connectionRow(h.entry, ctx, h)), 4, hits.connections[0]?.score ?? 0)
  return out
}
