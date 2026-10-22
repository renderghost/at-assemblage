import { SIDEBAR_SHORTCUT } from '../components/workspace/SidebarToggle'
import { COMMAND_BAR_SHORTCUT, NEW_CARD_SHORTCUT } from '../components/workspace/shortcuts'
import { config } from '../config'
import { DEFAULTS, type PreferenceKey, type Preferences } from '../preferences/preferences'
import { styleForType } from '../services/sources/semble/connectionTypes'
import { useUiStore } from '../state/uiStore'
import {
  cardActions,
  collectionActions,
  connectionActions,
  connectTargetView,
  defaultTypeView,
  openUrl,
  pickCardView,
  pickCollectionView,
  typeView,
} from './entities'
import type { Command, CommandContext, CommandProvider, Row, View } from './types'

const store = useUiStore.getState

// ——— Create ———

const createCommands: CommandProvider = (ctx) => {
  // With one card or collection selected, Suggestions already act on it.
  const oneCard = ctx.selection.cards.length === 1 && ctx.selection.links.length === 0
  const oneCollection = ctx.selection.collections.length === 1 && ctx.selection.cards.length === 0
  const hidden = new Set([...(oneCard ? ['connect-cards', 'edit-card', 'delete-card'] : []), ...(oneCollection ? ['edit-collection', 'delete-collection'] : [])])
  return createCommandList(ctx).filter((c) => !hidden.has(c.id))
}

const createCommandList = (ctx: CommandContext): Command[] => [
  {
    id: 'new-card',
    title: 'Add card…',
    section: 'Create',
    icon: 'plus',
    keywords: ['new', 'create', 'link', 'url', 'page', 'bookmark'],
    shortcut: NEW_CARD_SHORTCUT,
    description: 'Save a page to your Semble library. Tip: paste a URL into this bar to add it straight away.',
    listed: true,
    run: () => store().openAddCard(),
  },
  {
    id: 'new-collection',
    title: 'New collection…',
    section: 'Create',
    icon: 'collection',
    keywords: ['create', 'add', 'folder', 'group'],
    description: 'Create a Semble collection. It is shown on the canvas straight away.',
    listed: true,
    run: () => store().openNewCollection(),
  },
  // Pick-then-act versions of the selection's actions, for when nothing is selected.
  {
    id: 'connect-cards',
    title: 'Connect cards…',
    section: 'Create',
    icon: 'link',
    keywords: ['connection', 'link', 'relate'],
    description: 'Choose a card, then the card it connects to, the type and an optional note.',
    run: () => ({
      push: pickCardView({ id: 'connect-from', chip: 'Connect from', ctx, onPick: (entry) => ({ push: connectTargetView(entry.item, ctx) }) }),
    }),
  },
  {
    id: 'edit-card',
    title: 'Edit card…',
    section: 'Create',
    icon: 'pencil',
    keywords: ['change', 'title', 'collections'],
    run: () => ({ push: pickCardView({ id: 'edit-card', chip: 'Edit card', ctx, onPick: (entry) => store().setEditCardId(entry.id) }) }),
  },
  {
    id: 'delete-card',
    title: 'Delete card…',
    section: 'Create',
    icon: 'trash',
    keywords: ['remove'],
    danger: true,
    run: () => ({ push: pickCardView({ id: 'delete-card', chip: 'Delete card', ctx, onPick: (entry) => store().setDeleteCardId(entry.id) }) }),
  },
  {
    id: 'edit-collection',
    title: 'Edit collection…',
    section: 'Create',
    icon: 'pencil',
    keywords: ['rename', 'description', 'open', 'personal'],
    run: () => ({ push: pickCollectionView({ id: 'edit-collection', chip: 'Edit collection', ctx, onPick: (g) => store().setEditCollectionId(g.id) }) }),
  },
  {
    id: 'delete-collection',
    title: 'Delete collection…',
    section: 'Create',
    icon: 'trash',
    keywords: ['remove'],
    danger: true,
    run: () => ({ push: pickCollectionView({ id: 'delete-collection', chip: 'Delete collection', ctx, onPick: (g) => store().setDeleteCollectionId(g.id) }) }),
  },
]

// ——— Canvas ———

const canvasCommands: CommandProvider = (ctx) => {
  const s = store()
  const cmds: Command[] = [
    { id: 'fit-view', title: 'Fit view', section: 'Canvas', icon: 'fit', shortcut: '1', keywords: ['zoom', 'all', 'overview'], listed: true, run: ctx.flow.fitView },
    { id: 'zoom-in', title: 'Zoom in', section: 'Canvas', icon: 'zoomIn', shortcut: '+', listed: true, run: ctx.flow.zoomIn },
    { id: 'zoom-out', title: 'Zoom out', section: 'Canvas', icon: 'zoomOut', shortcut: '−', listed: true, run: ctx.flow.zoomOut },
    { id: 'zoom-100', title: 'Zoom to 100%', section: 'Canvas', icon: 'search', shortcut: '0', keywords: ['actual size', 'reset zoom'], run: ctx.flow.zoomTo100 },
    {
      id: 'sidebar',
      title: ctx.sidebarOpen ? 'Hide sidebar' : 'Show sidebar',
      section: 'Canvas',
      icon: 'sidebar',
      shortcut: SIDEBAR_SHORTCUT,
      keywords: ['toggle', 'panel'],
      listed: true,
      run: () => s.toggleSidebar(),
    },
    {
      id: 'collections-tab',
      title: 'Go to Collections',
      section: 'Canvas',
      icon: 'collection',
      keywords: ['sidebar', 'tab'],
      run: () => {
        if (!store().sidebarOpen) store().toggleSidebar()
        store().setSidebarTab('collections')
      },
    },
    {
      id: 'filters-tab',
      title: 'Go to Filters',
      section: 'Canvas',
      icon: 'search',
      keywords: ['sidebar', 'tab', 'filter'],
      run: () => {
        if (!store().sidebarOpen) store().toggleSidebar()
        store().setSidebarTab('filters')
      },
    },
    {
      id: 'reload',
      title: 'Reload from your PDS',
      section: 'Canvas',
      icon: 'refresh',
      keywords: ['refresh', 'sync', 'fetch'],
      description: 'Re-read your cards, collections, connections and Margin notes.',
      run: ctx.refetchAll,
    },
  ]
  if (ctx.filtering) {
    cmds.push({ id: 'clear-filters', title: 'Clear filters', section: 'Canvas', icon: 'close', keywords: ['reset', 'search'], listed: true, run: () => s.resetFilters() })
  }
  if (ctx.onCanvas.groups.size) {
    cmds.push({
      id: 'clear-collections',
      title: 'Clear the canvas',
      section: 'Canvas',
      icon: 'close',
      keywords: ['hide', 'collections', 'empty', 'deselect'],
      description: 'Hide every collection from the canvas. Nothing is deleted.',
      run: () => s.setSelectedGroupIds([]),
    })
  }
  if (ctx.groups.length > ctx.onCanvas.groups.size) {
    cmds.push({
      id: 'show-all',
      title: 'Show all collections',
      section: 'Canvas',
      icon: 'collection',
      keywords: ['everything', 'all cards'],
      run: () => s.setSelectedGroupIds(ctx.groups.map((g) => g.id)),
    })
  }
  if (ctx.containers && ctx.onCanvas.groups.size) {
    const ids = [...ctx.onCanvas.groups]
    cmds.push(
      { id: 'collapse-all', title: 'Collapse all collections', section: 'Canvas', icon: 'collapse', run: () => ids.forEach((id) => s.toggleCollapsed(id, true)) },
      { id: 'expand-all', title: 'Expand all collections', section: 'Canvas', icon: 'expand', run: () => ids.forEach((id) => s.toggleCollapsed(id, false)) },
    )
  }
  return cmds
}

// ——— Suggestions: what you can do with the selection ———

const asSuggestions = (prefix: string, cmds: Command[]): Command[] => cmds.map((c) => ({ ...c, id: `${prefix}-${c.id}`, section: 'Suggestions' }))

const selectionCommands: CommandProvider = (ctx) => {
  const { cards, links, collections } = ctx.selection
  const cmds: Command[] = []
  if (cards.length === 1 && links.length === 0) {
    const entry = ctx.index.cardsById.get(cards[0]!.id)
    if (entry) {
      // "Select on canvas" is what you already have.
      cmds.push(...asSuggestions('card', cardActions(entry, ctx).filter((c) => c.id !== 'show')).map((c) => ({ ...c, title: c.id === 'card-connect' ? `Connect “${entry.item.title}” to…` : c.title })))
    }
  }
  if (cards.length === 2 && links.length === 0) {
    const [a, b] = cards as [(typeof cards)[0], (typeof cards)[0]]
    cmds.push(
      { id: 'connect-ab', title: `Connect “${a.title}” → “${b.title}”…`, section: 'Suggestions', icon: 'arrowRight', run: () => ({ push: typeView(a, b, ctx) }) },
      { id: 'connect-ba', title: `Connect “${b.title}” → “${a.title}”…`, section: 'Suggestions', icon: 'arrowRight', run: () => ({ push: typeView(b, a, ctx) }) },
    )
  }
  if (links.length === 1 && cards.length === 0) {
    const link = links[0]!
    const title = (id: string) => ctx.index.cardsById.get(id)?.item.title ?? id
    cmds.push(
      ...asSuggestions(
        'connection',
        connectionActions({ ...link, sourceTitle: title(link.sourceId), targetTitle: title(link.targetId) }, ctx).filter((c) => c.id !== 'show'),
      ),
    )
  }
  if (links.length > 1 && cards.length === 0) {
    cmds.push({
      id: 'delete-links',
      title: `Delete ${links.length} connections…`,
      section: 'Suggestions',
      icon: 'trash',
      danger: true,
      run: () => store().requestDeleteLinks(links.map((l) => l.id)),
    })
  }
  if (collections.length === 1 && cards.length === 0) {
    cmds.push(...asSuggestions('collection', collectionActions(collections[0]!, ctx).filter((c) => c.id !== 'show')))
  }
  if (cards.length + links.length + collections.length > 0) {
    cmds.push({
      id: 'zoom-selection',
      title: 'Zoom to selection',
      section: 'Suggestions',
      icon: 'focus',
      shortcut: '2',
      run: () => store().requestFocus({ nodes: [...cards.map((c) => c.id), ...collections.map((g) => g.id)], edges: links.map((l) => l.id) }),
    })
  }
  return cmds.map((c) => ({ ...c, listed: true }))
}

// ——— Settings: every preference as instant commands ———

type Choice = { key: PreferenceKey; label: string; options: [string, string][]; keywords?: string[] }

const CHOICES: Choice[] = [
  { key: 'theme', label: 'Theme', options: [['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']], keywords: ['appearance', 'mode', 'colour'] },
  { key: 'textSize', label: 'Text size', options: [['normal', 'Normal'], ['large', 'Large'], ['larger', 'Larger']], keywords: ['font', 'zoom', 'appearance'] },
  { key: 'collectionPresentation', label: 'Collections on the canvas', options: [['containers', 'Containers'], ['flat', 'Flat']], keywords: ['boxes', 'layout'] },
  { key: 'lineStyle', label: 'Line style', options: [['curved', 'Curved'], ['straight', 'Straight'], ['angled', 'Angled']], keywords: ['edges', 'connections', 'lines'] },
  { key: 'recommendedType', label: 'Recommended type', options: [['preselect', 'Choose it for me'], ['badge', 'Only mark it'], ['off', 'Off']], keywords: ['connection'] },
  {
    key: 'confirmDeleteConnections',
    label: 'Confirm before deleting connections',
    options: [['always', 'Always'], ['several', 'Only when deleting several'], ['never', 'Never']],
    keywords: ['ask', 'delete'],
  },
]

type Toggle = { key: PreferenceKey; on: string; off: string; keywords?: string[]; available?: () => boolean }

const TOGGLES: Toggle[] = [
  { key: 'showMinimap', on: 'Show minimap', off: 'Hide minimap', keywords: ['map', 'overview'] },
  { key: 'showEdgeLabels', on: 'Always show connection labels', off: 'Show connection labels on hover only', keywords: ['edges'] },
  { key: 'showExternal', on: 'Show cards outside these collections', off: 'Hide cards outside these collections', keywords: ['external', 'dashed'] },
  { key: 'snapToGrid', on: 'Turn on snap to grid', off: 'Turn off snap to grid', keywords: ['align'] },
  { key: 'zoomToNewCards', on: 'Turn on zoom to new cards', off: 'Turn off zoom to new cards' },
  { key: 'useSembleData', on: "Use Semble's public data", off: "Stop using Semble's public data", keywords: ['privacy', 'suggestions'], available: () => !!config.sembleApi },
  { key: 'linkPreviews', on: 'Turn on link previews', off: 'Turn off link previews', keywords: ['privacy', 'cardyb'], available: () => !!config.linkPreviewService },
  { key: 'siteImages', on: 'Load site icons and images', off: "Don't load site icons and images", keywords: ['privacy', 'favicons', 'thumbnails'] },
]

const settingsCommands: CommandProvider = (ctx) => {
  const prefs = ctx.preferences
  const set = <K extends PreferenceKey>(key: K, value: Preferences[K]) => store().setPreference(key, value)
  const cmds: Command[] = [
    {
      id: 'preferences',
      title: 'Open Preferences…',
      section: 'Settings',
      icon: 'settings',
      keywords: ['settings', 'options', 'config'],
      listed: true,
      run: () => store().setPreferencesOpen(true),
    },
  ]
  for (const choice of CHOICES) {
    const current = choice.options.find(([v]) => v === prefs[choice.key])?.[1] ?? String(prefs[choice.key])
    for (const [value, label] of choice.options) {
      if (value === prefs[choice.key]) continue
      cmds.push({
        id: `pref-${choice.key}-${value}`,
        title: `${choice.label}: ${label}`,
        section: 'Settings',
        icon: 'settings',
        keywords: ['settings', ...(choice.keywords ?? [])],
        subtitle: `Now: ${current}`,
        description: value === DEFAULTS[choice.key] ? `${label} is the default.` : undefined,
        run: () => set(choice.key, value as never),
      })
    }
  }
  for (const t of TOGGLES) {
    if (t.available && !t.available()) continue
    const on = prefs[t.key] === true
    cmds.push({
      id: `pref-${t.key}`,
      title: on ? t.off : t.on,
      section: 'Settings',
      icon: 'settings',
      keywords: ['settings', 'toggle', ...(t.keywords ?? [])],
      subtitle: `Now: ${on ? 'on' : 'off'}`,
      run: () => set(t.key, !on as never),
    })
  }
  const always = prefs.reduceMotion === 'always'
  cmds.push(
    {
      id: 'pref-reduceMotion',
      title: always ? 'Stop always reducing motion' : 'Always reduce motion',
      section: 'Settings',
      icon: 'settings',
      keywords: ['settings', 'animation', 'accessibility'],
      subtitle: `Now: ${always ? 'always' : 'follows your system'}`,
      run: () => set('reduceMotion', always ? 'system' : 'always'),
    },
    {
      id: 'pref-default-type',
      title: 'Default connection type…',
      section: 'Settings',
      icon: 'settings',
      keywords: ['settings', 'relationship'],
      subtitle: `Now: ${styleForType(prefs.defaultConnectionType).label}`,
      run: () => ({ push: defaultTypeView() }),
    },
    {
      id: 'pref-reset',
      title: 'Reset settings to defaults…',
      section: 'Settings',
      icon: 'refresh',
      keywords: ['settings', 'preferences', 'restore'],
      run: () => ({ push: confirmView('Reset settings', 'Reset every setting to its default', () => store().resetPreferences()) }),
    },
  )
  return cmds
}

function confirmView(chip: string, title: string, confirm: () => void): View {
  return {
    id: `confirm:${chip}`,
    chip,
    placeholder: 'Press Enter to confirm, or Esc to go back',
    sections: () => [
      {
        id: 'confirm',
        rows: [
          { id: 'yes', icon: { kind: 'icon', name: 'check' }, title, run: confirm, runLabel: 'Confirm', danger: true },
          { id: 'no', icon: { kind: 'icon', name: 'close' }, title: 'Cancel', run: () => undefined, runLabel: 'Cancel' },
        ],
      },
    ],
  }
}

// ——— Help & account ———

const SHORTCUTS: [string, string][] = [
  [COMMAND_BAR_SHORTCUT, 'Open the command bar'],
  [NEW_CARD_SHORTCUT, 'Add a card'],
  [SIDEBAR_SHORTCUT, 'Show or hide the sidebar'],
  ['1', 'Fit view'],
  ['2', 'Zoom to selection'],
  ['0', 'Zoom to 100%'],
  ['+ −', 'Zoom in and out'],
  ['Delete', 'Delete the selected connections'],
  ['Shift', 'Hold to select several, or drag a selection box'],
  ['↑ ↓', 'Command bar: move'],
  ['↵', 'Command bar: run'],
  [`${COMMAND_BAR_SHORTCUT} →`, 'Command bar: actions for the highlighted result'],
  ['⌫', 'Command bar: back, when the field is empty'],
  ['Esc', 'Command bar: back, then close'],
]

function shortcutsView(): View {
  return {
    id: 'shortcuts',
    chip: 'Keyboard shortcuts',
    placeholder: 'Search shortcuts…',
    sections: (q) => {
      const rows: Row[] = SHORTCUTS.map(([keys, what]) => ({
        id: `shortcut:${what}`,
        icon: { kind: 'icon', name: 'info' },
        title: what,
        shortcut: keys,
        run: () => 'stay',
        runLabel: '',
      }))
      const query = q.trim().toLowerCase()
      return [{ id: 'shortcuts', title: 'Keyboard shortcuts', rows: query ? rows.filter((r) => r.title.toLowerCase().includes(query)) : rows }]
    },
  }
}

const appCommands: CommandProvider = (ctx) => {
  const profile = (handle: string, did: string) => ({
    bsky: `${config.bskyWeb}/profile/${handle}`,
    semble: `${config.sembleWeb}/profile/${handle}`,
    margin: `${config.marginWeb}/profile/${did}`,
  })
  const me = profile(ctx.handle, ctx.did)
  const us = profile(config.assemblage.handle, config.assemblage.did)
  return [
    { id: 'shortcuts', title: 'Keyboard shortcuts', section: 'Help & account', icon: 'info', keywords: ['keys', 'help', 'hotkeys'], listed: true, run: () => ({ push: shortcutsView() }) },
    { id: 'feedback', title: 'Give feedback', section: 'Help & account', icon: 'feedback', keywords: ['bug', 'idea', 'help'], listed: true, run: () => openUrl(config.feedbackUrl) },
    { id: 'me-bsky', title: 'View your profile on Bluesky', section: 'Help & account', icon: 'external', keywords: ['me', 'account'], run: () => openUrl(me.bsky) },
    { id: 'me-semble', title: 'View your profile on Semble', section: 'Help & account', icon: 'external', keywords: ['me', 'account'], run: () => openUrl(me.semble) },
    { id: 'me-margin', title: 'View your profile on Margin', section: 'Help & account', icon: 'external', keywords: ['me', 'account'], run: () => openUrl(me.margin) },
    { id: 'us-bsky', title: 'Follow Assemblage on Bluesky', section: 'Help & account', icon: 'external', keywords: ['news', 'updates'], run: () => openUrl(us.bsky) },
    { id: 'us-semble', title: 'Assemblage on Semble', section: 'Help & account', icon: 'external', run: () => openUrl(us.semble) },
    { id: 'us-margin', title: 'Assemblage on Margin', section: 'Help & account', icon: 'external', run: () => openUrl(us.margin) },
    { id: 'sign-out', title: 'Sign out', section: 'Help & account', icon: 'logout', keywords: ['log out', 'exit'], listed: true, run: ctx.signOut },
  ]
}

/** Every command source. To add commands, add a provider here (or extend one). */
export const COMMAND_PROVIDERS: CommandProvider[] = [selectionCommands, createCommands, canvasCommands, settingsCommands, appCommands]
