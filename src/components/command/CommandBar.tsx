import { useReactFlow, type Viewport } from '@xyflow/react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { actionsView } from '../../commands/entities'
import type { Range } from '../../commands/match'
import { COMMAND_PROVIDERS } from '../../commands/providers'
import { loadRecents, rankRecents, recordUse } from '../../commands/recents'
import { rootSections } from '../../commands/root'
import type { Row, RowIcon, RunResult, Section, View } from '../../commands/types'
import { motion } from '../../preferences/appearance'
import { useTypeRecommendation } from '../../queries/suggestions'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import { normaliseUrl } from '../../services/sources/url'
import { useUiStore, type SelectionIds } from '../../state/uiStore'
import { Spinner } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { toUrl, useLinkPreview } from '../workspace/NewCardDialog'
import { COMMAND_BAR_SHORTCUT, isMac } from '../workspace/shortcuts'
import { CommandPreview } from './CommandPreview'
import { Keys } from './Keys'
import { useCommandContext } from './useCommandContext'

/** ⌘K / Ctrl+K opens the bar from anywhere, except over another dialog. Inside the bar it opens actions. */
export function useCommandBarShortcut() {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(isMac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return
      const s = useUiStore.getState()
      if (s.commandBarOpen || document.querySelector('dialog[open]')) return
      e.preventDefault()
      s.setContextMenu(null)
      s.setCommandBarOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function CommandBar() {
  const open = useUiStore((s) => s.commandBarOpen)
  useCommandBarShortcut()
  // Mounted only while open, so every visit starts fresh at the root.
  return open ? <CommandBarDialog /> : null
}

/** Only pasted-looking links count, so searching "node.js" stays a search. */
function urlIn(query: string): string | null {
  const q = query.trim()
  return /^(https?:\/\/|www\.)\S+$/i.test(q) ? toUrl(q) : null
}

function Highlight({ text, ranges }: { text: string; ranges?: Range[] }) {
  if (!ranges?.length) return <>{text}</>
  const parts: ReactNode[] = []
  let at = 0
  for (const [s, e] of ranges) {
    if (s > at) parts.push(text.slice(at, s))
    parts.push(
      <mark key={s} className="bg-transparent font-semibold text-accent">
        {text.slice(s, e)}
      </mark>,
    )
    at = e
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

function SiteIcon({ domain }: { domain?: string }) {
  const siteImages = useUiStore((s) => s.preferences.siteImages)
  const [failed, setFailed] = useState(false)
  if (domain && siteImages && !failed) {
    return <img src={`https://${domain}/favicon.ico`} alt="" width={16} height={16} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  }
  return (
    <span aria-hidden="true" className="text-[12px] font-semibold uppercase text-ink-3">
      {(domain ?? '?').charAt(0)}
    </span>
  )
}

function RowIconView({ icon, disabled }: { icon: RowIcon; disabled?: boolean }) {
  const tile = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-2'
  if (disabled) return <span className={tile}><Spinner /></span>
  if (icon.kind === 'site') return <span className={tile}>{icon.note ? <Icon name="note" /> : <SiteIcon domain={icon.domain} />}</span>
  if (icon.kind === 'type') {
    const style = styleForType(icon.type)
    return (
      <span className={tile} style={{ color: style.colour }}>
        <Icon name={style.icon} />
      </span>
    )
  }
  return (
    <span className={tile}>
      <Icon name={icon.name} />
    </span>
  )
}

function RowView({ row, domId, active, onHover, onRun }: { row: Row; domId: string; active: boolean; onHover: () => void; onRun: () => void }) {
  return (
    <div
      id={domId}
      role="option"
      aria-selected={active}
      aria-disabled={row.disabled || undefined}
      onMouseMove={row.disabled ? undefined : onHover}
      onClick={row.disabled ? undefined : onRun}
      className={`flex items-center gap-3 rounded-lg px-2.5 py-2 ${row.disabled ? 'cursor-default text-ink-3' : 'cursor-pointer'} ${active ? 'bg-accent-soft' : ''}`}
    >
      <RowIconView icon={row.icon} disabled={row.disabled} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13.5px] font-medium leading-5 ${row.danger ? 'text-danger' : ''}`}>
          <Highlight text={row.title} ranges={row.titleRanges} />
        </div>
        {row.subtitle ? <div className="truncate text-[12px] leading-4 text-ink-3">{row.subtitle}</div> : null}
        {row.detail ? (
          <div className="truncate text-[12px] leading-4 text-ink-2">
            {row.detail.label ? <span className="text-ink-3">{row.detail.label}: </span> : null}
            <Highlight text={row.detail.text} ranges={row.detail.ranges} />
          </div>
        ) : null}
      </div>
      {row.badge ? (
        <span
          className={`shrink-0 rounded-full border px-1.5 text-[11px] leading-[18px] ${row.badge === 'Recommended' ? 'border-accent text-accent' : 'border-line text-ink-3'}`}
        >
          {row.badge === 'Recommended' ? <Icon name="sparkle" size={10} className="mr-0.5 inline" /> : null}
          {row.badge}
        </span>
      ) : null}
      {row.shortcut ? <Keys keys={row.shortcut} className="shrink-0" /> : null}
    </div>
  )
}

type Level = { view: View | null; query: string; activeId: string | null; moved: boolean }

const ROOT: Level = { view: null, query: '', activeId: null, moved: false }

function CommandBarDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const flow = useReactFlow()
  const { ctx, loading, error, retry } = useCommandContext()
  const commands = useMemo(() => COMMAND_PROVIDERS.flatMap((provider) => provider(ctx)), [ctx])
  const [recents, setRecents] = useState(() => rankRecents(loadRecents()))
  const [stack, setStack] = useState<Level[]>([ROOT])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const linkPreviews = useUiStore((s) => s.preferences.linkPreviews)

  const level = stack[stack.length - 1]!
  const query = level.query
  const update = (patch: Partial<Level>) => setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1]!, ...patch }])

  const url = level.view ? null : urlIn(query)
  const known = url ? ctx.index.cardByUrl.has(normaliseUrl(url)) : false
  const link = useLinkPreview(url && linkPreviews && !known ? url : null)
  const live = { recommendation: useTypeRecommendation(level.view?.pair?.source, level.view?.pair?.target) }

  const rootView: View = {
    id: 'root',
    chip: '',
    placeholder: 'Search cards, collections and commands…',
    sections: (q) =>
      rootSections({ ctx, commands, recents, query: q, expanded, loading, error, retry, url: url ? { url, preview: link.preview } : null }),
  }
  const view = level.view ?? rootView
  const textMode = view.mode === 'text'

  const sections: Section[] = textMode
    ? []
    : view.sections(query, live).map((section) =>
        section.more?.length
          ? {
              ...section,
              rows: [
                ...section.rows,
                {
                  id: `more:${section.id}`,
                  icon: { kind: 'icon', name: 'chevronRight' },
                  title: `Show ${section.more.length} more`,
                  run: () => {
                    setExpanded((e) => new Set(e).add(section.id))
                    return 'stay'
                  },
                  runLabel: 'Show more',
                },
              ],
            }
          : section,
      )
  const rows = sections.flatMap((s) => s.rows)
  const selectable = rows.filter((r) => !r.disabled)
  const preferred = level.moved ? level.activeId : (view.initialRowId?.(live) ?? level.activeId)
  const active = selectable.find((r) => r.id === preferred) ?? selectable[0]
  const domId = (row: Row) => `${listId}-${rows.indexOf(row)}`

  // ——— Opening, closing and the live canvas preview ———

  const saved = useRef<Viewport | null>(null)
  const closing = useRef(false)
  const close = (cancelled: boolean) => {
    if (closing.current) return
    closing.current = true
    useUiStore.getState().setCanvasSpotlight(null)
    // Esc puts the canvas back where it was; choosing something keeps where the preview went.
    if (cancelled && saved.current) void flow.setViewport(saved.current, { duration: motion(200) })
    useUiStore.getState().setCommandBarOpen(false)
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement as HTMLElement | null
    closing.current = false
    dialog.showModal()
    inputRef.current?.focus()
    return () => {
      closing.current = true
      if (dialog.open) dialog.close()
      useUiStore.getState().setCanvasSpotlight(null)
      if (!document.activeElement || document.activeElement === document.body) previous?.focus?.()
    }
  }, [])

  const spotKey = active?.spotlight ? JSON.stringify(active.spotlight) : ''
  useEffect(() => {
    const s = useUiStore.getState()
    if (!spotKey) {
      s.setCanvasSpotlight(null)
      return
    }
    const spot = JSON.parse(spotKey) as SelectionIds
    // A short delay, so holding ↓ doesn't send the canvas flying past every card.
    const timer = setTimeout(() => {
      const nodes = flow.getNodes()
      const present = new Set(nodes.map((n) => n.id))
      const ids = spot.nodes.filter((id) => present.has(id))
      if (!ids.length) return s.setCanvasSpotlight(null)
      const inside = nodes.filter((n) => n.parentId && ids.includes(n.parentId)).map((n) => n.id)
      saved.current ??= flow.getViewport()
      s.setCanvasSpotlight({ nodes: [...ids, ...inside], edges: spot.edges })
      // Land the preview in the part of the canvas the bar doesn't cover.
      const bar = dialogRef.current?.getBoundingClientRect()
      const canvas = document.querySelector('.react-flow')?.getBoundingClientRect()
      let top = 48
      if (bar && canvas && bar.bottom - canvas.top + 200 < canvas.height) top = bar.bottom - canvas.top + 24
      void flow.fitView({
        nodes: ids.map((id) => ({ id })),
        padding: { top: `${Math.round(top)}px`, left: '48px', right: '48px', bottom: '40px' },
        duration: motion(220),
        maxZoom: 1.1,
      })
    }, 90)
    return () => clearTimeout(timer)
  }, [spotKey, flow])

  useEffect(() => {
    if (active) document.getElementById(domId(active))?.scrollIntoView({ block: 'nearest' })
    // Scroll only when the highlighted row changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, view.id])

  // ——— Running things ———

  const push = (next: View) => {
    setStack((s) => [...s, { view: next, query: '', activeId: null, moved: false }])
    inputRef.current?.focus()
  }
  const pop = () => {
    if (stack.length > 1) setStack((s) => s.slice(0, -1))
  }
  const handle = (result: RunResult) => {
    if (result === 'stay') return
    if (result && typeof result === 'object') return push(result.push)
    close(false)
  }
  const run = (row: Row | undefined) => {
    if (!row?.run || row.disabled) return
    if (row.recentKey) setRecents(rankRecents(recordUse(row.recentKey)))
    handle(row.run())
  }
  const move = (delta: number) => {
    if (!selectable.length) return
    const at = active ? selectable.indexOf(active) : -1
    const next = selectable[(at + delta + selectable.length) % selectable.length]!
    update({ activeId: next.id, moved: true })
  }
  const openActions = () => {
    if (active?.actions) push(actionsView(active))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    const mod = isMac ? e.metaKey : e.ctrlKey
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (stack.length > 1) pop()
      else close(true)
    } else if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (level.view?.id.startsWith('actions:')) pop()
      else if (active?.actions) openActions()
      else close(true)
    } else if (textMode) {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (view.submit) handle(view.submit(query))
      } else if (e.key === 'Backspace' && !query && stack.length > 1) {
        e.preventDefault()
        pop()
      }
    } else if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault()
      move(e.key === 'PageDown' ? 5 : -5)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(active)
    } else if (e.key === 'ArrowRight' && active?.actions && e.currentTarget.selectionStart === query.length) {
      e.preventDefault()
      openActions()
    } else if (e.key === 'Backspace' && !query && stack.length > 1) {
      e.preventDefault()
      pop()
    }
  }

  const empty = !textMode && rows.length === 0 ? (view.empty?.(query) ?? { title: query.trim() ? `No results for “${query.trim()}”` : 'Nothing here' }) : null
  const actionsOpen = !!level.view?.id.startsWith('actions:')
  const count = selectable.length

  return (
    <dialog
      ref={dialogRef}
      aria-label="Command bar"
      className="command-bar mx-auto mb-auto mt-[12vh] h-[min(480px,calc(100dvh-24vh))] w-[min(760px,calc(100vw-32px))] max-w-none overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl open:flex open:flex-col"
      onCancel={(e) => {
        e.preventDefault()
        if (stack.length > 1) pop()
        else close(true)
      }}
      // The browser closed it (not us): sync up. React's dev double-mount closes and reopens it,
      // so a close event while it's open again is stale.
      onClose={() => {
        if (!dialogRef.current?.open) close(true)
      }}
      onClick={(e) => {
        // A click on the backdrop (outside the bar's box) closes it.
        if (e.target === dialogRef.current) close(true)
      }}
    >
      <div className="ui-scale flex min-h-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
          {stack.length > 1 ? (
            <button
              type="button"
              aria-label="Back"
              title="Back (Esc)"
              onClick={() => {
                pop()
                inputRef.current?.focus()
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <Icon name="chevronRight" className="rotate-180" />
            </button>
          ) : (
            <Icon name="search" className="shrink-0 text-ink-3" />
          )}
          {view.chip ? (
            <span className="max-w-[45%] shrink-0 truncate rounded-md bg-surface-2 px-2 py-0.5 text-[12.5px] font-medium text-ink-2" title={view.chip}>
              {view.chip}
            </span>
          ) : null}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              update({ query: e.target.value, activeId: null, moved: false })
              if (!level.view) setExpanded(new Set())
            }}
            onKeyDown={onKeyDown}
            placeholder={view.placeholder}
            aria-label={view.placeholder}
            maxLength={view.textLimit}
            spellCheck={textMode}
            autoComplete="off"
            {...(textMode
              ? {}
              : {
                  role: 'combobox',
                  'aria-expanded': true,
                  'aria-controls': listId,
                  'aria-autocomplete': 'list' as const,
                  'aria-activedescendant': active ? domId(active) : undefined,
                })}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          {loading ? <Spinner /> : null}
        </div>

        <div className="flex min-h-0 flex-1">
          {textMode ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {view.preview ? (
                <div className="max-w-md rounded-lg border border-line bg-surface-2/40 p-4">
                  <CommandPreview preview={view.preview(query)} groups={ctx.groups} link={link} />
                </div>
              ) : (
                <p className="text-[13px] text-ink-3">{view.placeholder}.</p>
              )}
            </div>
          ) : (
            <div id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
              {empty ? (
                <div className="px-3 py-10 text-center">
                  <p className="text-[14px] font-medium">{empty.title}</p>
                  {empty.hint ? <p className="mt-1 text-[12.5px] text-ink-3">{empty.hint}</p> : null}
                </div>
              ) : (
                sections.map((section) => (
                  <div key={section.id} role="group" aria-labelledby={section.title ? `${listId}-h-${section.id}` : undefined} className="mb-1">
                    {section.title ? (
                      <div id={`${listId}-h-${section.id}`} className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                        {section.title}
                      </div>
                    ) : null}
                    {section.rows.map((row) => (
                      <RowView
                        key={row.id}
                        row={row}
                        domId={domId(row)}
                        active={row === active}
                        onHover={() => row !== active && update({ activeId: row.id, moved: true })}
                        onRun={() => {
                          run(row)
                          inputRef.current?.focus()
                        }}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
          {textMode ? null : (
            <aside aria-label="Preview" className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-line bg-surface-2/40 p-4 sm:block">
              <CommandPreview preview={active?.preview} groups={ctx.groups} link={link} />
            </aside>
          )}
        </div>

        <footer className="flex h-10 shrink-0 items-center gap-3 border-t border-line px-3 text-[12px] text-ink-3">
          <span aria-hidden="true" className="min-w-0 flex-1 truncate">
            {textMode && view.textLimit ? `${query.length}/${view.textLimit}` : stack.length > 1 ? '' : `${COMMAND_BAR_SHORTCUT} anywhere opens this bar`}
          </span>
          <span className="sr-only" aria-live="polite">
            {textMode ? '' : `${count} result${count === 1 ? '' : 's'}`}
          </span>
          {textMode ? (
            <span className="inline-flex items-center gap-1.5">
              <Keys keys="↵" /> {view.submitLabel ?? 'Save'}
            </span>
          ) : active?.runLabel ? (
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <Keys keys="↵" /> {active.runLabel}
            </span>
          ) : null}
          {!textMode && (active?.actions || actionsOpen) ? (
            <span className="inline-flex items-center gap-1.5">
              <Keys keys={COMMAND_BAR_SHORTCUT} /> {actionsOpen ? 'Close actions' : 'Actions'}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <Keys keys="Esc" /> {stack.length > 1 ? 'Back' : 'Close'}
          </span>
        </footer>
      </div>
    </dialog>
  )
}
