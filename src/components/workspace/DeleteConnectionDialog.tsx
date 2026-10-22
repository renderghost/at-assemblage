import { useEffect } from 'react'
import { useBulkConnectionWrites, useDeleteConnection } from '../../queries/semble'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useWorkspace } from './WorkspaceContext'

export function DeleteConnectionDialog() {
  const ids = useUiStore((s) => s.pendingDeleteLinkIds)
  const requestDeleteLinks = useUiStore((s) => s.requestDeleteLinks)
  const { linksById, itemsById } = useWorkspace()
  const remove = useDeleteConnection()
  const bulk = useBulkConnectionWrites()
  const links = ids.map((id) => linksById.get(id)).filter((l) => l && !l.pending)
  const open = links.length > 0
  const close = () => requestDeleteLinks([])
  const single = links.length === 1 ? links[0]! : null
  const ask = useUiStore((s) => s.preferences.confirmDeleteConnections)
  const skipConfirm = ask === 'never' || (ask === 'several' && !!single)

  const confirm = () => {
    close()
    if (single) remove.mutate(single.id)
    else
      bulk.mutate({
        writes: links.map((l) => ({ kind: 'delete' as const, uri: l!.id })),
        description: `${links.length} connections deleted.`,
      })
  }

  // Preferences → Confirm before deleting connections: delete straight away when not asked to confirm.
  useEffect(() => {
    if (open && skipConfirm) confirm()
  })

  return (
    <Dialog open={open && !skipConfirm} title={single ? 'Delete connection?' : `Delete ${links.length} connections?`} onClose={close}>
      {open ? (
        <div className="space-y-4">
          {single ? (
            <p className="text-sm leading-relaxed">
              This permanently deletes the <strong>{styleForType(single.type).label}</strong> connection from{' '}
              <strong>{itemsById.get(single.sourceId)?.title}</strong> to <strong>{itemsById.get(single.targetId)?.title}</strong>{' '}
              from your PDS.
            </p>
          ) : (
            <p className="text-sm leading-relaxed">
              This permanently deletes {links.length} connection records from your PDS.
            </p>
          )}
          <p className="text-[13px] text-ink-3">Cards and collections are not affected.</p>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button onClick={close} autoFocus>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" onClick={confirm}>
              {single ? 'Delete connection' : `Delete ${links.length} connections`}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
