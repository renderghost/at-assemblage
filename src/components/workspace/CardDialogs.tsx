import { useMemo, useState } from 'react'
import { useDeleteCard, useUpdateCardCollections } from '../../queries/cards'
import { describeError } from '../../services/atproto/errors'
import { cardUrl, planCardDeletion } from '../../services/sources/semble/cards'
import { cleanUrl } from '../../services/sources/url'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useWorkspace } from './WorkspaceContext'

function useCardRecord(id: string | null) {
  const { library, resolveItem } = useWorkspace()
  const record = id ? library.data?.cards.find((c) => c.uri === id) : undefined
  return { record, item: id ? resolveItem(id) : undefined }
}

function EditCardForm({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { library, groups, collections } = useWorkspace()
  const { record, item } = useCardRecord(cardId)
  const setDeleteCardId = useUiStore((s) => s.setDeleteCardId)
  const update = useUpdateCardCollections()
  const current = useMemo(
    () => new Set((library.data?.links ?? []).filter((l) => l.value.card.uri === cardId).map((l) => l.value.collection.uri as string)),
    [library.data, cardId],
  )
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(current))
  if (!record || !item) return <p className="text-sm text-ink-3">This card is no longer in your library.</p>

  const url = cardUrl(record.value)
  const dirty = chosen.size !== current.size || [...chosen].some((id) => !current.has(id))
  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = () => {
    const byUri = new Map((collections.data?.records ?? []).map((r) => [r.uri as string, r]))
    update.mutate({ card: record, collections: [...chosen].flatMap((id) => byUri.get(id) ?? []) }, { onSuccess: onClose })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
        <div className="text-[12px] text-ink-3">{item.siteName ?? item.domain ?? 'Card'}</div>
        <div className="text-[15px] font-semibold leading-snug">{item.title}</div>
        {url ? <div className="truncate font-mono text-[12px] text-ink-3">{cleanUrl(url)}</div> : null}
        <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
          The title comes from the page; Semble doesn't support changing it. Edit your note from the Notes section.
        </p>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Collections</legend>
        {groups.length === 0 ? (
          <p className="text-[13px] text-ink-3">You have no collections yet.</p>
        ) : (
          <ul className="max-h-60 space-y-px overflow-y-auto rounded-md border border-line p-1">
            {groups.map((g) => (
              <li key={g.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={chosen.has(g.id)}
                    onChange={() => toggle(g.id)}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {chosen.size === 0 ? (
          <p className="mt-1.5 text-[12px] text-ink-3">In no collection, the card stays in your library but won't appear on the canvas.</p>
        ) : null}
      </fieldset>

      {update.isError ? <Alert tone="error">{describeError(update.error).message}</Alert> : null}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <Button
          variant="danger"
          icon="trash"
          onClick={() => {
            onClose()
            setDeleteCardId(cardId)
          }}
        >
          Delete card…
        </Button>
        <div className="flex gap-2">
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!dirty} busy={update.isPending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}

/** Edit a card the way Semble allows: which collections it's in, or delete it. */
export function EditCardDialog() {
  const cardId = useUiStore((s) => s.editCardId)
  const close = () => useUiStore.getState().setEditCardId(null)
  return (
    <Dialog open={!!cardId} title="Edit card" onClose={close} width="w-[480px]">
      {cardId ? <EditCardForm key={cardId} cardId={cardId} onClose={close} /> : null}
    </Dialog>
  )
}

function DeleteCardForm({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { library, connections } = useWorkspace()
  const { record, item } = useCardRecord(cardId)
  const remove = useDeleteCard()
  const plan = useMemo(
    () => (record && library.data ? planCardDeletion(record, library.data, connections.data?.connections ?? []) : null),
    [record, library.data, connections.data],
  )
  const [includeConnections, setIncludeConnections] = useState(true)
  if (!record || !item || !plan) return <p className="text-sm text-ink-3">This card is no longer in your library.</p>

  const n = plan.connections.length
  const parts = [
    plan.notes.length ? `your note on it` : '',
    plan.links.length ? `its place in ${plan.links.length} collection${plan.links.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">
        This permanently deletes <strong>{item.title}</strong> from your PDS
        {parts.length ? <>, along with {parts.join(' and ')}</> : null}. It will disappear from Semble too.
      </p>
      {n > 0 ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeConnections}
            onChange={(e) => setIncludeConnections(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
          />
          <span>
            Also delete its {n} connection{n === 1 ? '' : 's'}
            <span className="block text-[12px] text-ink-3">
              If kept, they still point at this page and it will show as an outside card.
            </span>
          </span>
        </label>
      ) : null}
      {remove.isError ? <Alert tone="error">{describeError(remove.error).message}</Alert> : null}
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button onClick={onClose} autoFocus disabled={remove.isPending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          icon="trash"
          busy={remove.isPending}
          onClick={() => remove.mutate({ card: record, includeConnections: includeConnections && n > 0 }, { onSuccess: onClose })}
        >
          Delete card
        </Button>
      </div>
    </div>
  )
}

export function DeleteCardDialog() {
  const cardId = useUiStore((s) => s.deleteCardId)
  const close = () => useUiStore.getState().setDeleteCardId(null)
  return (
    <Dialog open={!!cardId} title="Delete card?" onClose={close}>
      {cardId ? <DeleteCardForm key={cardId} cardId={cardId} onClose={close} /> : null}
    </Dialog>
  )
}
