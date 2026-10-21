import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { config } from '../../config'
import type { GraphItem, GraphLink } from '../../graph/model'
import { INSPECTOR_INSET, INSPECTOR_WIDTH } from '../../graph/viewport'
import { useCreateMarginNote } from '../../queries/margin'
import { useSaveSembleNote } from '../../queries/notes'
import { rkeyOf } from '../../services/atproto/aturi'
import { describeError } from '../../services/atproto/errors'
import { CONNECTION_TYPES, styleForType, typeInfo } from '../../services/sources/semble/connectionTypes'
import { NOTE_MAX } from '../../services/sources/semble/notes'
import { cleanUrl, isHttpUrl } from '../../services/sources/url'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { ConnectionEditPanel } from './ConnectionEditPanel'
import { InspectorGroup, InspectorSection } from './InspectorSection'
import { SelectionPanel } from './SelectionPanel'
import { SuggestionsSection } from './SuggestionsSection'
import { TypeSwatch } from './TypeSwatch'
import { useWorkspace } from './WorkspaceContext'

type UrlItem = GraphItem & { url: string }

function formatDate(iso?: string) {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Semble's page for a URL: semble.so/url/<url>, one encoded path segment per URL segment. */
function sembleUrlPage(url: string) {
  return `${config.sembleWeb}/url/${url.split('/').map(encodeURIComponent).join('/')}`
}

const textareaClass =
  'w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-[14px] leading-6 focus:border-accent focus:outline-none'

// ——— Details ———

function DetailsSection({ item, canEdit, onEdit }: { item: GraphItem; canEdit: boolean; onEdit: () => void }) {
  const [imageFailed, setImageFailed] = useState(false)
  const image = item.imageUrl && isHttpUrl(item.imageUrl) && !imageFailed ? item.imageUrl : null
  return (
    <InspectorSection id="details" title="Details">
      {image ? (
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="aspect-[1200/630] w-full bg-surface-2 object-cover"
        />
      ) : null}
      <div className="space-y-1 px-4 pb-4 pt-2 text-[14px] leading-6">
        {item.external ? (
          <div className="pb-1">
            <Alert tone="info">
              {item.external.label}. It appears because a connection from your selected collections points to it.
            </Alert>
          </div>
        ) : null}
        <div>
          <div className="truncate text-ink-3">{item.siteName ?? item.domain ?? (item.kind === 'NOTE' ? 'Note card' : 'Card')}</div>
          <div className="text-[16px] font-bold leading-6 text-ink">{item.title}</div>
        </div>
        {canEdit || item.url ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {canEdit ? (
              <Button size="sm" variant="primary" icon="pencil" onClick={onEdit} title="Edit this card's collections, or delete it">
                Edit
              </Button>
            ) : null}
            {item.url && isHttpUrl(item.url) ? (
              <a
                href={sembleUrlPage(item.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[13px] font-medium text-ink hover:bg-surface-2"
              >
                View on Semble
                <Icon name="link" size={14} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        ) : null}
        {item.description ? <p className="line-clamp-3 text-ink-3">{item.description}</p> : null}
        {item.url && isHttpUrl(item.url) ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title={item.url}
            className="block truncate text-ink underline underline-offset-2 hover:text-accent"
          >
            {item.url}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </InspectorSection>
  )
}

// ——— Notes ———

function SembleNoteEditor({
  initial,
  onCancel,
  onSave,
  busy,
}: {
  initial: string
  onCancel: () => void
  onSave: (text: string) => void
  busy: boolean
}) {
  const [text, setText] = useState(initial)
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onSave(text)
      }}
    >
      <label htmlFor="semble-note" className="sr-only">
        Your Semble note on this card
      </label>
      <textarea
        id="semble-note"
        rows={4}
        autoFocus
        maxLength={NOTE_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note about this card…"
        className={textareaClass}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" busy={busy} disabled={!text.trim() || text.trim() === initial.trim()}>
          Save note
        </Button>
      </div>
    </form>
  )
}

function MarginNoteForm({ item }: { item: UrlItem }) {
  const [text, setText] = useState('')
  const create = useCreateMarginNote()
  const error = create.error ? describeError(create.error).message : null
  return (
    <form
      className="space-y-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        const draft = text
        setText('') // The optimistic note appears above; restore the text if the write fails.
        create.mutate({ url: item.url, title: item.title, text: draft }, { onError: () => setText(draft) })
      }}
    >
      <label htmlFor="margin-note" className="sr-only">
        New Margin note for this page
      </label>
      <textarea
        id="margin-note"
        rows={2}
        maxLength={3000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a Margin note about this page…"
        className={textareaClass}
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex justify-end">
        <Button size="sm" type="submit" variant="primary" busy={create.isPending} disabled={!text.trim()}>
          Save note
        </Button>
      </div>
    </form>
  )
}

function NotesSection({
  item,
  editing,
  setEditing,
}: {
  item: GraphItem
  editing: string | 'new' | null
  setEditing: (v: string | 'new' | null) => void
}) {
  const { library, annotationsByItem, margin } = useWorkspace()
  const save = useSaveSembleNote()
  const parent = library.data?.cards.find((c) => c.uri === item.id)
  const notes = useMemo(
    () => (library.data?.cards ?? []).filter((c) => c.value.parentCard?.uri === item.id),
    [library.data, item.id],
  )
  const annotations = annotationsByItem.get(item.id) ?? []
  const noteText = (c: (typeof notes)[number]) =>
    'text' in c.value.content && typeof c.value.content.text === 'string' ? c.value.content.text : ''

  const submit = (text: string, existing?: (typeof notes)[number]) => {
    if (!parent) return
    save.mutate({ parent, text, existing }, { onSuccess: () => setEditing(null) })
  }

  return (
    <InspectorSection id="notes" title="Notes" count={notes.length + annotations.length}>
      {parent ? (
        <InspectorGroup title="Semble">
          {notes.map((n) =>
            editing === n.uri ? (
              <SembleNoteEditor
                key={n.uri}
                initial={noteText(n)}
                busy={save.isPending}
                onCancel={() => setEditing(null)}
                onSave={(text) => submit(text, n)}
              />
            ) : (
              <div key={n.uri} className="group/note">
                <p className="whitespace-pre-wrap text-ink">{noteText(n)}</p>
                <button
                  type="button"
                  onClick={() => setEditing(n.uri)}
                  className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-accent hover:underline"
                >
                  <Icon name="pencil" size={13} /> Edit note
                </button>
              </div>
            ),
          )}
          {editing === 'new' ? (
            <SembleNoteEditor initial="" busy={save.isPending} onCancel={() => setEditing(null)} onSave={(text) => submit(text)} />
          ) : notes.length === 0 ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-ink-3">No Semble note yet.</p>
              <Button size="sm" icon="plus" onClick={() => setEditing('new')}>
                Add note
              </Button>
            </div>
          ) : null}
        </InspectorGroup>
      ) : null}
      {item.url ? (
        <InspectorGroup title="Margin">
          {margin.isError ? <Alert tone="warning">Could not load Margin notes. {describeError(margin.error).message}</Alert> : null}
          {annotations.length > 0 ? (
            <ul className="space-y-2">
              {annotations.map((a) => (
                <li key={a.id}>
                  {a.text ? <p className="whitespace-pre-wrap text-ink">{a.text}</p> : <p className="italic text-ink-3">({a.motivation})</p>}
                  <p className="text-[12px] text-ink-3">{a.pending ? 'Saving…' : formatDate(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3">No Margin notes from you on this page.</p>
          )}
          <MarginNoteForm item={item as UrlItem} />
        </InspectorGroup>
      ) : null}
    </InspectorSection>
  )
}

// ——— Collections ———

function CollectionsSection({ item }: { item: GraphItem }) {
  const { library, groups } = useWorkspace()
  const { handle } = useAuth()
  const collections = useMemo(() => {
    const ids = new Set((library.data?.links ?? []).filter((l) => l.value.card.uri === item.id).map((l) => l.value.collection.uri as string))
    return groups.filter((g) => ids.has(g.id))
  }, [library.data, groups, item.id])

  return (
    <InspectorSection id="collections" title="Collections" count={collections.length}>
      <InspectorGroup>
        {collections.length === 0 ? (
          <p className="text-ink-3">This card isn't in any of your collections.</p>
        ) : (
          <ul className="space-y-2">
            {collections.map((c) => (
              <li key={c.id}>
                <a
                  href={`${config.sembleWeb}/profile/${handle}/collections/${rkeyOf(c.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[16px] text-accent underline underline-offset-2 hover:opacity-80"
                >
                  {c.name}
                  <span className="sr-only"> (opens in Semble in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </InspectorGroup>
    </InspectorSection>
  )
}

// ——— Connections ———

function ConnectionRow({ link, other, direction }: { link: GraphLink; other?: GraphItem; direction: 'out' | 'in' }) {
  const requestSelection = useUiStore((s) => s.requestSelection)
  return (
    <li>
      <button
        type="button"
        onClick={() => requestSelection({ nodes: [], edges: [link.id] })}
        className="flex w-full items-center gap-2 rounded border border-line bg-surface px-3 py-2 text-left hover:border-line-strong hover:bg-surface-2"
      >
        <span className="shrink-0 text-ink-3" aria-label={direction === 'out' ? 'to' : 'from'}>
          {direction === 'out' ? '→' : '←'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium leading-5 text-ink">{other?.title ?? 'Unknown card'}</span>
          <span className="block truncate text-[12px] leading-4 text-ink-3">
            {other?.domain ?? (other?.url ? cleanUrl(other.url) : '')}
            {other?.external ? ' · outside' : ''}
            {link.note ? ` · ${link.note}` : ''}
          </span>
        </span>
        {link.pending ? <span className="shrink-0 text-[11px] text-accent">saving</span> : null}
      </button>
    </li>
  )
}

function ConnectionsSection({ item }: { item: GraphItem }) {
  const { data, itemsById } = useWorkspace()
  const grouped = useMemo(() => {
    const links = data.links.filter((l) => l.sourceId === item.id || l.targetId === item.id)
    const byType = new Map<string, GraphLink[]>()
    for (const l of links) {
      const key = typeInfo(l.type)?.value ?? (l.type?.trim().toUpperCase() || '')
      byType.set(key, [...(byType.get(key) ?? []), l])
    }
    const order = CONNECTION_TYPES.map((t) => t.value)
    return { total: links.length, groups: [...byType].sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) }
  }, [data.links, item.id])

  return (
    <InspectorSection id="connections" title="Connections" count={grouped.total}>
      {grouped.total === 0 ? (
        <InspectorGroup>
          <p className="text-ink-3">None yet. Hover over this card and drag from one of the dots on its edges to another card.</p>
        </InspectorGroup>
      ) : (
        grouped.groups.map(([type, links]) => (
          <InspectorGroup
            key={type}
            title={
              <span className="flex items-center gap-2">
                <TypeSwatch type={type || undefined} withIcon width={14} />
                {styleForType(type || undefined).label}
              </span>
            }
          >
            <ul className="space-y-2">
              {links.map((l) =>
                l.sourceId === item.id ? (
                  <ConnectionRow key={l.id} link={l} other={itemsById.get(l.targetId)} direction="out" />
                ) : (
                  <ConnectionRow key={l.id} link={l} other={itemsById.get(l.sourceId)} direction="in" />
                ),
              )}
            </ul>
          </InspectorGroup>
        ))
      )}
    </InspectorSection>
  )
}

// ——— Card inspector ———

function CardInspector({ item }: { item: GraphItem }) {
  const { library } = useWorkspace()
  const setEditCardId = useUiStore((s) => s.setEditCardId)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const isMine = !!library.data?.cards.some((c) => c.uri === item.id)

  return (
    <>
      <DetailsSection item={item} canEdit={isMine} onEdit={() => setEditCardId(item.id)} />
      <NotesSection item={item} editing={editing} setEditing={setEditing} />
      <CollectionsSection item={item} />
      <ConnectionsSection item={item} />
      {item.url && isHttpUrl(item.url) ? <SuggestionsSection key={item.url} card={item as UrlItem} /> : null}
    </>
  )
}

/**
 * The inspector floats over the canvas's right edge as a stack of
 * independently collapsible cards. The column itself ignores the pointer, so
 * the canvas stays usable in the gaps; it scrolls when the stack is taller
 * than the canvas.
 */
export function Inspector() {
  const selected = useUiStore((s) => s.selected)
  const { itemsById, linksById, connectionRecords } = useWorkspace()
  const shown = selected.nodes.length + selected.edges.length > 0

  // While sliding out, keep showing the last selection until it is off screen.
  const [lastSelected, setLastSelected] = useState(selected)
  if (shown && lastSelected !== selected) setLastSelected(selected)
  const view = shown ? selected : lastSelected

  const count = view.nodes.length + view.edges.length
  const item = view.nodes.length === 1 && count === 1 ? itemsById.get(view.nodes[0]!) : undefined
  const link = view.edges.length === 1 && count === 1 ? linksById.get(view.edges[0]!) : undefined

  // Start each new selection at the top of the stack.
  const scrollRef = useRef<HTMLElement>(null)
  const selectionKey = [...selected.nodes, ...selected.edges].join('|')
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [selectionKey])

  return (
    <aside
      ref={scrollRef}
      aria-label="Inspector"
      aria-hidden={!shown}
      inert={!shown}
      className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 flex flex-col gap-2 overflow-y-auto overscroll-contain transition-transform duration-150 ease-out [scrollbar-width:thin] motion-reduce:transition-none"
      style={{
        width: INSPECTOR_WIDTH + INSPECTOR_INSET * 2,
        padding: INSPECTOR_INSET,
        transform: shown ? undefined : 'translateX(100%)',
      }}
    >
      {item ? (
        <CardInspector key={item.id} item={item} />
      ) : link ? (
        <InspectorSection id="connection" title="Connection">
          <ConnectionEditPanel key={`${link.id}:${connectionRecords.get(link.id)?.cid}`} link={link} />
        </InspectorSection>
      ) : count > 1 ? (
        <InspectorSection id="selection" title="Selection" count={count}>
          <SelectionPanel />
        </InspectorSection>
      ) : null}
    </aside>
  )
}
