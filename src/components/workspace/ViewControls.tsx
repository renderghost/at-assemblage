import { Panel, useReactFlow, useStore } from '@xyflow/react'
import { useCallback, useEffect } from 'react'
import { FOCUS_PADDING, fitPadding } from '../../graph/viewport'
import { isTyping, overlayOpen } from './shortcuts'
import { useMinimapFits } from './useMinimapFits'
import { motion } from '../../preferences/appearance'
import { useUiStore } from '../../state/uiStore'
import { Icon, type IconName } from '../ui/Icon'

const DURATION = 250

function ControlButton({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  pressed,
  children,
}: {
  icon?: IconName
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children?: React.ReactNode
}) {
  const title = shortcut ? `${label} (${shortcut})` : label
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 min-w-8 items-center justify-center px-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35 aria-pressed:text-accent"
    >
      {icon ? <Icon name={icon} /> : children}
    </button>
  )
}

/**
 * Floating view controls (bottom-left of the canvas): zoom out/in, live zoom
 * level (click for 100%), fit view, zoom to selection, minimap toggle.
 * Keyboard: + / − zoom, 0 = 100%, 1 = fit view, 2 = zoom to selection.
 */
export function ViewControls() {
  const { zoomIn, zoomOut, zoomTo, fitView, getEdges } = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  const hasSelection = useUiStore((s) => s.selected.nodes.length + s.selected.edges.length > 0)
  const showMinimap = useUiStore((s) => s.preferences.showMinimap)
  const minimapFits = useMinimapFits()
  const setPreference = useUiStore((s) => s.setPreference)

  const fit = useCallback(() => {
    const { selected } = useUiStore.getState()
    fitView({ padding: fitPadding(selected.nodes.length + selected.edges.length > 0), duration: motion(DURATION) })
  }, [fitView])
  const zoomToSelection = useCallback(() => {
    const { selected } = useUiStore.getState()
    const ids = new Set(selected.nodes)
    for (const edge of getEdges()) {
      if (selected.edges.includes(edge.id)) {
        ids.add(edge.source)
        ids.add(edge.target)
      }
    }
    if (ids.size) fitView({ nodes: [...ids].map((id) => ({ id })), padding: FOCUS_PADDING, duration: motion(DURATION), maxZoom: 1.2 })
  }, [fitView, getEdges])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTyping(e.target) || overlayOpen()) return
      const actions: Record<string, () => void> = {
        '+': () => zoomIn({ duration: motion(DURATION) }),
        '=': () => zoomIn({ duration: motion(DURATION) }),
        '-': () => zoomOut({ duration: motion(DURATION) }),
        _: () => zoomOut({ duration: motion(DURATION) }),
        '0': () => zoomTo(1, { duration: motion(DURATION) }),
        '1': fit,
        '2': zoomToSelection,
      }
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomIn, zoomOut, zoomTo, fit, zoomToSelection])

  return (
    <Panel position="bottom-left" className="!m-3">
      <div
        role="toolbar"
        aria-label="View controls"
        className="flex items-center divide-x divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
      >
        <ControlButton icon="zoomOut" label="Zoom out" shortcut="-" onClick={() => zoomOut({ duration: motion(DURATION) })} />
        <ControlButton label="Zoom to 100%" shortcut="0" onClick={() => zoomTo(1, { duration: motion(DURATION) })}>
          <span className="w-10 text-center text-[12px] font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
        </ControlButton>
        <ControlButton icon="zoomIn" label="Zoom in" shortcut="+" onClick={() => zoomIn({ duration: motion(DURATION) })} />
        <ControlButton icon="fit" label="Fit view" shortcut="1" onClick={fit} />
        <ControlButton icon="focus" label="Zoom to selection" shortcut="2" onClick={zoomToSelection} disabled={!hasSelection} />
        {minimapFits ? (
          <ControlButton
            icon="minimap"
            label={showMinimap ? 'Hide minimap' : 'Show minimap'}
            pressed={showMinimap}
            onClick={() => setPreference('showMinimap', !showMinimap)}
          />
        ) : null}
      </div>
    </Panel>
  )
}
