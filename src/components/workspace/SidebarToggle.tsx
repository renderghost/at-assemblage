import { useEffect } from 'react'
import { useUiStore } from '../../state/uiStore'
import { Icon } from '../ui/Icon'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const SIDEBAR_SHORTCUT = isMac ? '⌘B' : 'Ctrl+B'

/** Cmd+B / Ctrl+B toggles the left sidebar from anywhere, except while a dialog is open. */
export function useSidebarShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'b' || !(isMac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      useUiStore.getState().toggleSidebar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * Show/hide the left sidebar. `floating` is the copy pinned to the canvas's
 * top-left while the sidebar is hidden, styled like the view controls.
 */
export function SidebarToggle({ floating = false }: { floating?: boolean }) {
  const open = useUiStore((s) => s.sidebarOpen)
  const toggle = useUiStore((s) => s.toggleSidebar)
  const label = open ? 'Hide sidebar' : 'Show sidebar'
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls="left-sidebar"
      aria-keyshortcuts={isMac ? 'Meta+B' : 'Control+B'}
      title={`${label} (${SIDEBAR_SHORTCUT})${open ? '' : ' · New card: ⌘K / Ctrl+K or right-click the canvas'}`}
      onClick={toggle}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center text-ink-2 hover:bg-surface-2 hover:text-ink ${floating ? '' : 'rounded-md'}`}
    >
      <Icon name="sidebar" />
    </button>
  )
  if (!floating) return button
  return <div className="absolute left-3 top-3 z-20 overflow-hidden rounded-lg border border-line bg-surface shadow-sm">{button}</div>
}
