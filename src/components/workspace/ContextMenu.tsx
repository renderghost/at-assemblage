import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { config } from '../../config'
import { rkeyOf } from '../../services/atproto/aturi'
import { isHttpUrl } from '../../services/sources/url'
import { useUiStore } from '../../state/uiStore'
import { Icon, type IconName } from '../ui/Icon'
import { NEW_CARD_SHORTCUT } from './shortcuts'
import { useWorkspace } from './WorkspaceContext'

type Item =
  | { kind: 'action'; label: string; icon: IconName; onSelect: () => void; danger?: boolean; hint?: string }
  | { kind: 'link'; label: string; icon: IconName; href: string }
  | { kind: 'separator' }

export const sembleCollectionPage = (handle: string, uri: string) => `${config.sembleWeb}/profile/${handle}/collections/${rkeyOf(uri)}`

export const sembleUrlPage = (url: string) => `${config.sembleWeb}/url/${url.split('/').map(encodeURIComponent).join('/')}`

/**
 * Right-click menu for the canvas: "New card" on empty space (placed where
 * you clicked); Edit / Delete / Open page / View on Semble on a card.
 * Keyboard: arrows move, Enter activates, Escape closes.
 */
export function ContextMenu() {
  const menu = useUiStore((s) => s.contextMenu)
  const close = useUiStore((s) => s.setContextMenu)
  const { library, resolveItem, groups } = useWorkspace()
  const { handle } = useAuth()
  const containersOn = useUiStore((s) => s.preferences.collectionPresentation === 'containers')
  const collectionLayouts = useUiStore((s) => s.collectionLayouts)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const items: Item[] = []
  if (menu?.kind === 'pane') {
    items.push({
      kind: 'action',
      label: 'New card',
      icon: 'plus',
      hint: NEW_CARD_SHORTCUT,
      onSelect: () => useUiStore.getState().openAddCard({ position: menu.flow }),
    })
  } else if (menu?.kind === 'card') {
    const item = resolveItem(menu.cardId)
    const mine = !!library.data?.cards.some((c) => c.uri === menu.cardId)
    if (mine) {
      items.push({ kind: 'action', label: 'Edit card…', icon: 'pencil', onSelect: () => useUiStore.getState().setEditCardId(menu.cardId) })
      items.push({
        kind: 'action',
        label: 'Delete card…',
        icon: 'trash',
        danger: true,
        onSelect: () => useUiStore.getState().setDeleteCardId(menu.cardId),
      })
    }
    if (item?.url && isHttpUrl(item.url)) {
      if (items.length) items.push({ kind: 'separator' })
      items.push({ kind: 'link', label: 'Open page', icon: 'external', href: item.url })
      items.push({ kind: 'link', label: 'View on Semble', icon: 'link', href: sembleUrlPage(item.url) })
    }
  }

  if (menu?.kind === 'collection') {
    const group = groups.find((g) => g.id === menu.collectionId)
    const collapsed = !!collectionLayouts[menu.collectionId]?.collapsed
    items.push({
      kind: 'action',
      label: 'New card here',
      icon: 'plus',
      onSelect: () => useUiStore.getState().openAddCard({ position: menu.flow, collectionIds: [menu.collectionId] }),
    })
    items.push({ kind: 'action', label: 'Edit collection…', icon: 'pencil', onSelect: () => useUiStore.getState().setEditCollectionId(menu.collectionId) })
    if (containersOn) {
      if (!collapsed) {
        items.push({ kind: 'action', label: 'Fit to cards', icon: 'fit', onSelect: () => useUiStore.getState().requestFitCollection(menu.collectionId) })
      }
      items.push({
        kind: 'action',
        label: collapsed ? 'Expand' : 'Collapse',
        icon: collapsed ? 'expand' : 'collapse',
        onSelect: () => useUiStore.getState().toggleCollapsed(menu.collectionId),
      })
    }
    items.push({ kind: 'separator' })
    if (group) items.push({ kind: 'link', label: 'View on Semble', icon: 'link', href: sembleCollectionPage(handle, group.id) })
    items.push({
      kind: 'action',
      label: 'Delete collection…',
      icon: 'trash',
      danger: true,
      onSelect: () => useUiStore.getState().setDeleteCollectionId(menu.collectionId),
    })
  }

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null)
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({
      left: Math.min(menu.x, window.innerWidth - width - 8),
      top: Math.min(menu.y, window.innerHeight - height - 8),
    })
    // Next frame: the canvas takes focus back after the right-click itself.
    const frame = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const dismiss = (e: Event) => {
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      close(null)
    }
    window.addEventListener('pointerdown', dismiss, true)
    window.addEventListener('wheel', dismiss, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    return () => {
      window.removeEventListener('pointerdown', dismiss, true)
      window.removeEventListener('wheel', dismiss, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('blur', dismiss)
    }
  }, [menu, close])

  if (!menu || items.length === 0) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    const all = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = all.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close(null)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length
      all[next]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      all[e.key === 'Home' ? 0 : all.length - 1]?.focus()
    }
  }

  const itemClass = (danger?: boolean) =>
    `flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] outline-none hover:bg-surface-2 focus:bg-surface-2 ${
      danger ? 'text-danger' : 'text-ink'
    }`

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.kind === 'pane' ? 'Canvas' : menu.kind === 'card' ? 'Card' : 'Collection'}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-xl"
      style={pos ?? { left: menu.x, top: menu.y, visibility: 'hidden' }}
    >
      {/* Scaled inside, so the menu's own position isn't (zoom would scale left/top too). */}
      <div className="ui-scale">
        {items.map((item, i) =>
          item.kind === 'separator' ? (
            <div key={i} role="separator" className="my-1 border-t border-line" />
          ) : item.kind === 'link' ? (
            <a
              key={i}
              role="menuitem"
              tabIndex={-1}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => close(null)}
              className={itemClass()}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(null)
                item.onSelect()
              }}
              className={itemClass(item.danger)}
            >
              <Icon name={item.icon} size={14} />
              <span className="flex-1">{item.label}</span>
              {item.hint ? <kbd className="font-sans text-[11px] text-ink-3">{item.hint}</kbd> : null}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
