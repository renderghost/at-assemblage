import { useDeleteCollection, useUpdateCollection } from '../../queries/collections'
import { describeError } from '../../services/atproto/errors'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { CollectionForm } from './NewCollectionDialog'
import { useWorkspace } from './WorkspaceContext'

function useCollectionRecord(id: string | null) {
  const { collections } = useWorkspace()
  return id ? collections.data?.records.find((r) => r.uri === id) : undefined
}

/** Edit what Semble supports for a collection: name, description, Personal/Open; or delete it. */
export function EditCollectionDialog() {
  const id = useUiStore((s) => s.editCollectionId)
  const close = () => useUiStore.getState().setEditCollectionId(null)
  const stored = useCollectionRecord(id)
  const update = useUpdateCollection()
  return (
    <Dialog open={!!id} title="Edit collection" onClose={close}>
      {stored ? (
        <CollectionForm
          key={stored.uri}
          initial={{
            name: stored.value.name,
            description: stored.value.description ?? '',
            accessType: stored.value.accessType === 'OPEN' ? 'OPEN' : 'CLOSED',
          }}
          submitLabel="Save"
          busy={update.isPending}
          error={update.isError ? `Collection not saved. ${describeError(update.error).message}` : null}
          note="Updates the collection on your PDS; Semble picks up the change."
          onSubmit={(values) => update.mutate({ stored, input: values }, { onSuccess: close })}
          onCancel={close}
          footerStart={
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                close()
                useUiStore.getState().setDeleteCollectionId(stored.uri)
              }}
            >
              Delete…
            </Button>
          }
        />
      ) : id ? (
        <p className="text-sm text-ink-3">This collection no longer exists.</p>
      ) : null}
    </Dialog>
  )
}

export function DeleteCollectionDialog() {
  const id = useUiStore((s) => s.deleteCollectionId)
  const close = () => useUiStore.getState().setDeleteCollectionId(null)
  const stored = useCollectionRecord(id)
  const { library } = useWorkspace()
  const remove = useDeleteCollection()
  const linkCount = stored ? (library.data?.links ?? []).filter((l) => l.value.collection.uri === stored.uri).length : 0
  return (
    <Dialog open={!!id} title="Delete collection?" onClose={close}>
      {stored ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            This permanently deletes <strong>{stored.value.name}</strong> from your PDS, so it disappears from Semble too.
            Its {linkCount} card{linkCount === 1 ? '' : 's'} stay in your library and in any other collections.
          </p>
          {remove.isError ? <Alert tone="error">{describeError(remove.error).message}</Alert> : null}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button onClick={close} autoFocus disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" busy={remove.isPending} onClick={() => remove.mutate(stored, { onSuccess: close })}>
              Delete collection
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
