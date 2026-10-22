import { useEffect, useMemo, useState } from 'react'
import { useCreateCard } from '../../queries/create'
import { describeError } from '../../services/atproto/errors'
import { fetchLinkPreview, type LinkPreview } from '../../services/linkPreview'
import { network } from '../../lexicons'
import { cleanUrl, isHttpUrl, normaliseUrl } from '../../services/sources/url'
import { Alert } from '../ui/Alert'
import { Button, Spinner } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useUiStore, type AddCardRequest } from '../../state/uiStore'
import { isTyping, overlayOpen } from './shortcuts'
import { useWorkspace } from './WorkspaceContext'

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'

/** Accepts "example.com/x" as well as full URLs. */
export function toUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  return isHttpUrl(candidate) && new URL(candidate).hostname.includes('.') ? candidate : null
}

export function useLinkPreview(url: string | null) {
  const [state, setState] = useState<{ url: string | null; loading: boolean; preview: LinkPreview | null }>({
    url: null,
    loading: false,
    preview: null,
  })
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState({ url, loading: true, preview: null })
      fetchLinkPreview(url, { signal: controller.signal }).then((preview) => {
        if (!controller.signal.aborted) setState({ url, loading: false, preview })
      })
    }, 450)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [url])
  return state.url === url ? state : { url, loading: false, preview: null }
}

function NewCardForm({ request, onDone }: { request: AddCardRequest; onDone: () => void }) {
  const { groups, activeGroupIds, collections, library, resolveItem } = useWorkspace()
  const create = useCreateCard()
  const setDraft = useUiStore((s) => s.setDraft)
  const [rawUrl, setRawUrl] = useState(request.url ?? '')
  const [title, setTitle] = useState<string | null>(request.title ?? null)
  const [note, setNote] = useState('')
  const [chosen, setChosen] = useState<string[]>(request.collectionIds ?? activeGroupIds)

  const url = toUrl(rawUrl)
  // A prefilled request (e.g. from a Semble suggestion) already carries metadata.
  const prefilled = !!(request.url && (request.title || request.description)) && url === toUrl(request.url)
  const { linkPreviews, siteImages } = useUiStore((s) => s.preferences)
  const { loading, preview } = useLinkPreview(prefilled || !linkPreviews ? null : url)
  const effectiveTitle = title ?? preview?.title ?? ''
  const description = prefilled ? request.description : preview?.description
  const imageUrl = prefilled ? request.imageUrl : preview?.imageUrl
  const connectTo = request.connectTo ? resolveItem(request.connectTo.cardId) : undefined

  // Is this URL already a card? Then only missing collection links (and a first note) are added.
  const existing = useMemo(() => {
    if (!url || !library.data) return null
    const key = normaliseUrl(url)
    const card = library.data.cards.find((c) => {
      if (c.value.parentCard || c.value.type !== 'URL') return false
      const content = network.cosmik.card.urlContent.isTypeOf(c.value.content) ? c.value.content : undefined
      const u = c.value.url ?? content?.url
      return !!u && normaliseUrl(u) === key
    })
    if (!card) return null
    const inCollections = new Set<string>(library.data.links.filter((l) => l.value.card.uri === card.uri).map((l) => l.value.collection.uri))
    const hasNote = library.data.cards.some((c) => c.value.parentCard?.uri === card.uri)
    return { card, inCollections, hasNote }
  }, [url, library.data])

  const collectionRecords = new Map((collections.data?.records ?? []).map((r) => [r.uri, r]))
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  const willShow = chosen.some((id) => activeGroupIds.includes(id)) || [...(existing?.inCollections ?? [])].some((id) => activeGroupIds.includes(id))

  const submit = () => {
    if (!url) return
    create.mutate(
      {
        url,
        title: effectiveTitle,
        description,
        imageUrl,
        note,
        collections: chosen.flatMap((id) => (existing?.inCollections.has(id) ? [] : (collectionRecords.get(id) ?? []))),
        position: request.position,
      },
      {
        onSuccess: (plan) => {
          onDone()
          // Then propose the connection to the card the suggestion came from.
          const link = request.connectTo
          if (!link) return
          // Stay on the card whose suggestions are being worked through.
          useUiStore.getState().requestSelection({ nodes: [link.cardId], edges: [] }, { focus: false })
          const [sourceId, targetId] =
            link.direction === 'outgoing' ? [link.cardId, plan.cardRef.uri] : [plan.cardRef.uri, link.cardId]
          setDraft({ sourceId, targetId, type: link.type })
        },
      },
    )
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="new-card-url" className="block text-sm font-medium">
          URL
        </label>
        <input
          id="new-card-url"
          type="url"
          inputMode="url"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={rawUrl}
          onChange={(e) => setRawUrl(e.target.value)}
          placeholder="Paste a link"
          aria-invalid={!!rawUrl.trim() && !url}
          className={`${inputClass} h-10 font-mono text-[13px]`}
        />
        {rawUrl.trim() && !url ? <p className="text-[12px] text-danger">Enter a web address, e.g. https://example.com/article</p> : null}
      </div>

      {url ? (
        <div className="flex gap-3 rounded-md border border-line bg-surface-2 p-3" aria-live="polite">
          {siteImages && imageUrl && isHttpUrl(imageUrl) ? (
            <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="h-16 w-24 shrink-0 rounded object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] text-ink-3">{cleanUrl(url)}</div>
            {loading ? (
              <div className="mt-1 text-[13px] text-ink-3">
                <Spinner label="Fetching preview…" />
              </div>
            ) : (
              <>
                <div className="line-clamp-2 text-[13px] font-semibold">{effectiveTitle || cleanUrl(url)}</div>
                {description ? <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">{description}</p> : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {existing ? (
        <Alert tone="info">
          This link is already in your library. It will be added to the collections you choose
          {existing.hasNote ? ', and its existing note is kept (Semble keeps one note per link)' : ''}.
        </Alert>
      ) : url ? (
        <div className="space-y-1.5">
          <label htmlFor="new-card-title" className="block text-sm font-medium">
            Title <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input
            id="new-card-title"
            value={effectiveTitle}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={cleanUrl(url)}
            className={`${inputClass} h-9`}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="new-card-note" className="block text-sm font-medium">
          Note <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <textarea
          id="new-card-note"
          rows={3}
          maxLength={10000}
          value={note}
          disabled={!!existing?.hasNote}
          onChange={(e) => setNote(e.target.value)}
          placeholder={existing?.hasNote ? 'This link already has your note' : 'Add a note about this card'}
          className={`${inputClass} resize-y py-2 disabled:opacity-60`}
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Collections</legend>
        {groups.length === 0 ? (
          <p className="text-[13px] text-ink-3">You have no collections yet. The card will go into your library.</p>
        ) : (
          <ul className="max-h-44 space-y-px overflow-y-auto rounded-md border border-line p-1">
            {groups.map((g) => {
              const already = !!existing?.inCollections.has(g.id)
              return (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={already || chosen.includes(g.id)}
                      disabled={already}
                      onChange={() => toggle(g.id)}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    {already ? <span className="text-[11.5px] text-ink-3">already in</span> : null}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {url && !willShow ? (
          <p className="mt-1.5 text-[12px] text-ink-3">
            None of the chosen collections is shown on the canvas, so the card will not appear in the graph.
          </p>
        ) : null}
      </fieldset>

      {connectTo ? (
        <p className="text-[12.5px] text-ink-2">
          After saving, you'll be asked how it connects to <strong>{connectTo.title}</strong>.
        </p>
      ) : null}

      {create.isError ? <Alert tone="error">Card not added. {describeError(create.error).message}</Alert> : null}

      <p className="text-[12px] leading-snug text-ink-3">
        Saved to your PDS as Semble records in one commit, so it appears in Semble too.
        {url && !prefilled ? ' The preview comes from Bluesky’s link-card service.' : ''}
      </p>

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button onClick={onDone} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!url} busy={create.isPending}>
          {existing ? 'Add to collections' : connectTo ? 'Add card and connect' : 'Add card'}
        </Button>
      </div>
    </form>
  )
}


/** ⌘K / Ctrl+K opens the add-card form from anywhere, including text fields, unless a dialog is open. */
/** N opens the add-card form, unless you're typing or something else is open. */
export function useNewCardShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return
      if (isTyping(e.target) || overlayOpen()) return
      e.preventDefault()
      useUiStore.getState().openAddCard()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** The add-card dialog, driven by `addCardRequest` in the UI store. */
export function NewCardDialog() {
  const request = useUiStore((s) => s.addCardRequest)
  const close = useUiStore((s) => s.closeAddCard)
  return (
    <Dialog open={!!request} title="Add a card" onClose={close} width="w-[520px]">
      {request ? <NewCardForm request={request} onDone={close} /> : null}
    </Dialog>
  )
}
