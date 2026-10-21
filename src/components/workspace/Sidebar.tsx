import { useMemo, useRef, useState } from 'react'
import { isFiltering, type AnnotationFilter } from '../../graph/filters'
import { describeError } from '../../services/atproto/errors'
import { CONNECTION_TYPES, styleForType } from '../../services/sources/semble/connectionTypes'
import { config } from '../../config'
import { useUiStore, type SidebarTab } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button, IconButton, Spinner } from '../ui/Button'
import { BlueskyIcon } from '../ui/BlueskyIcon'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import { NEW_CARD_SHORTCUT } from './NewCardDialog'
import { NewCollectionDialog } from './NewCollectionDialog'
import { SidebarToggle } from './SidebarToggle'
import { UserMenu } from './UserMenu'
import { useWorkspace } from './WorkspaceContext'

/** One tab's content. The tab itself names it, so there's no heading. */
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3">{children}</div>
}

function CollectionPicker() {
  const { groups, collections, library, refetchAll } = useWorkspace()
  const [reloading, setReloading] = useState(false)
  const selected = useUiStore((s) => s.selectedGroupIds)
  const toggleGroup = useUiStore((s) => s.toggleGroup)
  const setSelectedGroupIds = useUiStore((s) => s.setSelectedGroupIds)
  const [creating, setCreating] = useState(false)

  let body: React.ReactNode
  if (collections.isPending) body = <Spinner label="Loading collections…" />
  else if (collections.isError)
    body = (
      <Alert
        tone="error"
        action={
          <Button size="sm" onClick={() => collections.refetch()}>
            Retry
          </Button>
        }
      >
        {describeError(collections.error).message}
      </Alert>
    )
  else if (groups.length === 0)
    body = (
      <p className="text-[13px] leading-snug text-ink-3">
        You have no Semble collections yet. Create one at{' '}
        <a href="https://semble.so" target="_blank" rel="noreferrer" className="text-accent underline">
          semble.so
        </a>
        , then reload.
      </p>
    )
  else
    body = (
      <fieldset>
        <legend className="sr-only">Collections to show</legend>
        {selected.length > 0 ? (
          <div className="mb-1 flex items-center justify-between text-[12px] text-ink-3">
            <span>{selected.length} shown on the canvas</span>
            <button type="button" className="text-accent hover:underline" onClick={() => setSelectedGroupIds([])}>
              Clear
            </button>
          </div>
        ) : null}
        <ul className="-mx-1.5 space-y-px">
          {groups.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={selected.includes(g.id)}
                  onChange={() => toggleGroup(g.id)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1 truncate" title={g.description || g.name}>
                  {g.name}
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3">
                  {library.isPending ? '…' : (g.itemCount ?? 0)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    )

  return (
    <Panel>
      <div className="mb-2 flex items-center gap-1.5">
        <Button size="sm" icon="plus" className="min-w-0 flex-1 !justify-start" onClick={() => setCreating(true)}>
          New collection
        </Button>
        <IconButton
          icon="refresh"
          label="Reload everything from your PDS"
          className={`h-7 w-7 ${reloading ? '[&>svg]:animate-spin' : ''}`}
          disabled={reloading}
          onClick={async () => {
            setReloading(true)
            await refetchAll().finally(() => setReloading(false))
          }}
        />
      </div>
      {body}
      <NewCollectionDialog open={creating} onClose={() => setCreating(false)} />
    </Panel>
  )
}

function SearchBox() {
  const search = useUiStore((s) => s.filters.search)
  const setFilters = useUiStore((s) => s.setFilters)
  return (
    <div className="relative">
      <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <label htmlFor="graph-search" className="sr-only">
        Search cards
      </label>
      <input
        id="graph-search"
        type="search"
        value={search}
        onChange={(e) => setFilters({ search: e.target.value })}
        placeholder="Title, domain, URL, note, collection"
        className="h-8 w-full rounded-md border border-line bg-surface pl-8 pr-2 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none"
      />
    </div>
  )
}

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[12px] ${
        active ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function Filters() {
  const { data, activeGroupIds, groupNames, visible } = useWorkspace()
  const filters = useUiStore((s) => s.filters)
  const setFilters = useUiStore((s) => s.setFilters)
  const resetFilters = useUiStore((s) => s.resetFilters)

  const domains = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of data.items) if (i.domain && !i.external) counts.set(i.domain, (counts.get(i.domain) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)
  }, [data.items])

  const linkTypes = useMemo(() => {
    const present = new Set(data.links.map((l) => (l.type ?? '').toUpperCase()))
    const known = CONNECTION_TYPES.map((t) => t.value).filter((t) => present.has(t))
    const unknown = [...present].filter((t) => !CONNECTION_TYPES.some((k) => k.value === t)).sort()
    return [...known, ...unknown]
  }, [data.links])

  const active = isFiltering(filters)

  return (
    <Panel>
      <SearchBox />
      {active ? (
        <div className="mt-1.5 flex items-start justify-between gap-2 text-[12px] text-ink-3">
          <p role="status">
            Showing {visible.itemIds.size} of {data.items.length} cards, {visible.linkIds.size} of {data.links.length}{' '}
            connections.
          </p>
          <button type="button" className="shrink-0 text-accent hover:underline" onClick={resetFilters}>
            Reset
          </button>
        </div>
      ) : null}

      {activeGroupIds.length > 1 ? (
        <div className="mt-3">
          <h3 className="mb-1 text-[12px] font-medium text-ink-2">Collection</h3>
          <div className="flex flex-wrap gap-1">
            {activeGroupIds.map((id) => (
              <ChipToggle key={id} active={filters.groupIds.includes(id)} onClick={() => setFilters({ groupIds: toggle(filters.groupIds, id) })}>
                {groupNames.get(id)}
              </ChipToggle>
            ))}
          </div>
        </div>
      ) : null}

      {linkTypes.length > 0 ? (
        <div className="mt-3">
          <h3 className="mb-1 text-[12px] font-medium text-ink-2">Connection type</h3>
          <div className="flex flex-wrap gap-1">
            {linkTypes.map((t) => {
              const style = styleForType(t || undefined)
              return (
                <ChipToggle key={t} active={filters.linkTypes.includes(t)} onClick={() => setFilters({ linkTypes: toggle(filters.linkTypes, t) })}>
                  <svg width="14" height="6" aria-hidden="true">
                    <line x1="0" y1="3" x2="14" y2="3" stroke={style.colour} strokeWidth="2.5" strokeDasharray={style.dash} />
                  </svg>
                  {style.label}
                </ChipToggle>
              )
            })}
          </div>
        </div>
      ) : null}

      {domains.length > 1 ? (
        <div className="mt-3">
          <h3 className="mb-1 text-[12px] font-medium text-ink-2">Domain</h3>
          <div className="flex flex-wrap gap-1">
            {domains.map(([d, n]) => (
              <ChipToggle key={d} active={filters.domains.includes(d)} onClick={() => setFilters({ domains: toggle(filters.domains, d) })}>
                {d} <span className="text-ink-3">{n}</span>
              </ChipToggle>
            ))}
          </div>
        </div>
      ) : null}

      <fieldset className="mt-3">
        <legend className="mb-1 text-[12px] font-medium text-ink-2">Margin notes</legend>
        <div className="flex gap-3 text-[13px]">
          {(
            [
              ['any', 'Any'],
              ['with', 'With notes'],
              ['without', 'Without'],
            ] as [AnnotationFilter, string][]
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="annotation-filter"
                checked={filters.annotations === value}
                onChange={() => setFilters({ annotations: value })}
                className="accent-[var(--color-accent)]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </Panel>
  )
}

const TABS: { id: SidebarTab; label: string }[] = [
  { id: 'collections', label: 'Collections' },
  { id: 'filters', label: 'Filters' },
]

function SidebarTabs() {
  const tab = useUiStore((s) => s.sidebarTab)
  const setTab = useUiStore((s) => s.setSidebarTab)
  const filtering = useUiStore((s) => isFiltering(s.filters))
  const hasSelection = useUiStore((s) => s.selectedGroupIds.length > 0)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + 1) % TABS.length]!.id
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <>
      <div role="tablist" aria-label="Sidebar" className="flex shrink-0 gap-1 border-b border-line px-3" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`sidebar-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`sidebar-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className="-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2 text-[13px] font-medium text-ink-3 hover:text-ink aria-selected:border-accent aria-selected:text-ink"
          >
            {t.label}
            {t.id === 'filters' && filtering ? (
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="(active)" title="Filters are active" />
            ) : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`sidebar-panel-${tab}`}
        aria-labelledby={`sidebar-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {tab === 'collections' ? (
          <CollectionPicker />
        ) : hasSelection ? (
          <Filters />
        ) : (
          <p className="px-4 py-3 text-[13px] leading-snug text-ink-3">Choose one or more collections to search and filter their cards.</p>
        )}
      </div>
    </>
  )
}

/** Small header buttons linking out: feedback form and Assemblage on Bluesky. */
function ExternalLinks() {
  const linkClass =
    'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-line bg-surface px-1.5 text-[12px] font-medium text-ink hover:bg-surface-2'
  return (
    <div className="flex shrink-0 gap-1 border-t border-line px-3 py-2">
      <a href={config.feedbackUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        <Icon name="feedback" size={14} />
        Give feedback
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <a href={config.blueskyUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        <span className="text-[#1185fe]">
          <BlueskyIcon size={14} />
        </span>
        Follow on Bluesky
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  )
}

function NewCardButton() {
  const openAddCard = useUiStore((s) => s.openAddCard)
  return (
    <div className="shrink-0 border-b border-line px-3 py-2.5">
      <Button
        variant="primary"
        icon="plus"
        className="w-full"
        title={`New card (${NEW_CARD_SHORTCUT})`}
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => openAddCard()}
      >
        New card
        <kbd className="ml-auto rounded bg-white/20 px-1.5 font-sans text-[11px] font-medium">{NEW_CARD_SHORTCUT}</kbd>
      </Button>
    </div>
  )
}

export function Sidebar() {
  return (
    <nav
      id="left-sidebar"
      aria-label="Collections and filters"
      className="flex min-h-0 flex-col overflow-hidden border-r border-line bg-surface"
    >
      {/* 59px tall (incl. border) with 13px inset: the toggle sits exactly where its floating copy appears when collapsed. */}
      <div className="flex h-[59px] shrink-0 items-center gap-1.5 border-b border-line pl-[13px] pr-4">
        <SidebarToggle />
        <div className="h-7 min-w-0 flex-1">
          <Logo />
        </div>
      </div>
      <NewCardButton />
      <SidebarTabs />
      <ExternalLinks />
      <UserMenu />
    </nav>
  )
}
