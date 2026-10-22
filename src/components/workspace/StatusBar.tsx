import { useEffect } from 'react'
import { INSPECTOR_RESERVED } from '../../graph/viewport'
import { useUiStore, type Notice } from '../../state/uiStore'
import { useInspectorShown } from './useMinimapFits'
import { Button, IconButton } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { useWorkspace } from './WorkspaceContext'

const TONE: Record<Notice['tone'], string> = {
  error: 'border-danger/40 bg-danger-soft text-danger',
  success: 'border-success/40 bg-success-soft text-success',
  info: 'border-line bg-surface text-ink',
}

function NoticeToast({ notice }: { notice: Notice }) {
  const dismiss = useUiStore((s) => s.dismissNotice)
  const setDraft = useUiStore((s) => s.setDraft)
  useEffect(() => {
    if (notice.tone === 'error') return // Errors stay until dismissed.
    const t = setTimeout(() => dismiss(notice.id), 4000)
    return () => clearTimeout(t)
  }, [notice, dismiss])

  return (
    <div
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] shadow-md ${TONE[notice.tone]}`}
    >
      <Icon name={notice.tone === 'error' ? 'warning' : 'check'} className="shrink-0" />
      <span className="min-w-0 flex-1">{notice.message}</span>
      {notice.retryDraft ? (
        <Button
          size="sm"
          onClick={() => {
            setDraft(notice.retryDraft!)
            dismiss(notice.id)
          }}
        >
          Retry
        </Button>
      ) : null}
      <IconButton icon="close" label="Dismiss" className="h-6 w-6" onClick={() => dismiss(notice.id)} />
    </div>
  )
}

/** Floating notices plus a one-line summary of what is loaded and saving. */
export function StatusBar() {
  const inspectorShown = useInspectorShown()
  const notices = useUiStore((s) => s.notices)
  const { data, visible, connections, margin, library } = useWorkspace()
  const saving = data.links.some((l) => l.pending)
  const external = data.items.filter((i) => i.external && visible.itemIds.has(i.id)).length
  const fetching = connections.isFetching || library.isFetching || margin.isFetching

  return (
    <>
      {/* Centred in the canvas area left of the floating inspector. */}
      <div
        className="pointer-events-none absolute left-0 top-3 z-30 flex justify-center px-4"
        style={{ right: inspectorShown ? INSPECTOR_RESERVED : 0 }}
      >
        <div className="ui-scale flex w-[520px] max-w-full flex-col gap-2">
          {notices.map((n) => (
            <NoticeToast key={n.id} notice={n} />
          ))}
        </div>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-line bg-surface px-3 text-[12px] text-ink-3">
        <span>
          {visible.itemIds.size - external} cards
          {external ? ` · ${external} outside` : ''} · {visible.linkIds.size} connections
        </span>
        {saving ? <span className="text-accent">Saving…</span> : fetching ? <span>Syncing with your PDS…</span> : <span>Up to date</span>}
        <span className="ml-auto min-w-0 truncate">Positions are saved in this browser only</span>
      </div>
    </>
  )
}
