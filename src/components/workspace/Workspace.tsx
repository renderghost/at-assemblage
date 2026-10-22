import { ReactFlowProvider } from '@xyflow/react'
import { describeError } from '../../services/atproto/errors'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button, Spinner } from '../ui/Button'
import { ConnectionEditor } from './ConnectionEditor'
import { DeleteConnectionDialog } from './DeleteConnectionDialog'
import { GraphCanvas } from './GraphCanvas'
import { DeleteCardDialog, EditCardDialog } from './CardDialogs'
import { ContextMenu } from './ContextMenu'
import { Inspector } from './Inspector'
import { NewCardDialog, useNewCardShortcut } from './NewCardDialog'
import { ReconnectDialog } from './ReconnectDialog'
import { Sidebar } from './Sidebar'
import { SidebarToggle, useSidebarShortcut } from './SidebarToggle'
import { StatusBar } from './StatusBar'
import { useWorkspace, WorkspaceProvider } from './WorkspaceContext'

function CentreMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-8 text-center text-ink-2">{children}</div>
}

function GraphArea() {
  const hasSelection = useUiStore((s) => s.selectedGroupIds.length > 0)
  const { graphLoading, graphError, data, refetchAll } = useWorkspace()

  if (!hasSelection) {
    return (
      <CentreMessage>
        <div className="max-w-sm">
          <h2 className="text-base font-semibold text-ink">Choose collections to map</h2>
          <p className="mt-1 text-[13px]">
            Tick one or more collections on the left. Their cards appear here as nodes, with your Semble connections
            drawn between them.
          </p>
        </div>
      </CentreMessage>
    )
  }
  if (graphLoading) return <CentreMessage><Spinner label="Loading cards and connections…" /></CentreMessage>
  if (graphError && data.items.length === 0) {
    return (
      <CentreMessage>
        <div className="w-[420px]">
          <Alert tone="error" action={<Button size="sm" onClick={() => refetchAll()}>Retry</Button>}>
            Could not load your cards. {describeError(graphError).message}
          </Alert>
        </div>
      </CentreMessage>
    )
  }
  if (data.items.length === 0) {
    return (
      <CentreMessage>
        <p className="text-[13px]">The selected collections have no cards yet.</p>
      </CentreMessage>
    )
  }
  return <GraphCanvas />
}

function Warnings() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const { data, graphError } = useWorkspace()
  const messages = [...data.warnings]
  if (graphError && data.items.length > 0) messages.push(`Some data failed to refresh: ${describeError(graphError).message}`)
  if (messages.length === 0) return null
  return (
    <div className={`absolute top-3 z-10 w-[360px] ${sidebarOpen ? 'left-3' : 'left-14'}`}>
      <Alert tone="warning">
        <ul>
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Alert>
    </div>
  )
}

export function Workspace() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  useSidebarShortcut()
  useNewCardShortcut()
  return (
    <ReactFlowProvider>
      <WorkspaceProvider>
        {/* Locked to the viewport: the page never scrolls; only panels scroll inside themselves. */}
        <div
          className={`fixed inset-0 grid grid-rows-[minmax(0,1fr)] overflow-hidden ${
            sidebarOpen ? 'grid-cols-[280px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]'
          }`}
        >
          {sidebarOpen ? <Sidebar /> : null}
          <main aria-label="Graph" className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="relative min-h-0 flex-1">
              <GraphArea />
              {sidebarOpen ? null : <SidebarToggle floating />}
              <Warnings />
              <Inspector />
            </div>
            <StatusBar />
          </main>
        </div>
        <ConnectionEditor />
        <ContextMenu />
        <NewCardDialog />
        <EditCardDialog />
        <DeleteCardDialog />
        <DeleteConnectionDialog />
        <ReconnectDialog />
      </WorkspaceProvider>
    </ReactFlowProvider>
  )
}
