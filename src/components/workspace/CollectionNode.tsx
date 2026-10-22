import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { COLLAPSED_SIZE, EMPTY_SIZE, HEADER_HEIGHT } from '../../graph/containers'
import { SIDES, sourceHandleId, targetHandleId, type Side } from '../../graph/edgeSides'
import type { GraphGroup } from '../../graph/model'
import { useUiStore } from '../../state/uiStore'
import { Icon } from '../ui/Icon'

export type CollectionNodeData = {
  group: GraphGroup
  /** Cards of this collection on the canvas. */
  count: number
  collapsed: boolean
}

export type CollectionNodeType = Node<CollectionNodeData, 'collection'>

const POSITION: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }

export function accessLabel(accessType?: string): { icon: 'lock' | 'globe'; label: string; hint: string } {
  return accessType === 'OPEN'
    ? { icon: 'globe', label: 'Open', hint: 'Anyone can add' }
    : { icon: 'lock', label: 'Personal', hint: 'Only you can add' }
}

function CollapseButton({ id, collapsed, name }: { id: string; collapsed: boolean; name: string }) {
  const toggleCollapsed = useUiStore((s) => s.toggleCollapsed)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        toggleCollapsed(id)
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
      title={collapsed ? 'Expand (or double-click)' : 'Collapse (or double-click the header)'}
      className="nodrag inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <Icon name="chevronRight" className={`transition-transform ${collapsed ? '' : 'rotate-90'}`} />
    </button>
  )
}

/**
 * A collection on the canvas. Expanded, it's a tinted box around its cards:
 * drag the header to move it, resize from any edge (it can't shrink past its
 * cards). Collapsed, it's one compact node that rolled-up connections attach to.
 */
function CollectionNodeImpl({ id, data, selected }: NodeProps<CollectionNodeType>) {
  const { group, count, collapsed } = data
  const access = accessLabel(group.accessType)
  const countLabel = `${count} card${count === 1 ? '' : 's'}`

  if (collapsed) {
    return (
      <div
        style={COLLAPSED_SIZE}
        className={`flex items-center gap-2 rounded-lg border-2 bg-surface px-3 shadow-sm ${
          selected ? 'border-accent ring-2 ring-accent/30' : 'border-accent/40'
        }`}
      >
        {SIDES.map((side) => (
          <Handle key={`s-${side}`} id={sourceHandleId(side)} type="source" position={POSITION[side]} isConnectable={false} className="!opacity-0" />
        ))}
        {SIDES.map((side) => (
          <Handle key={`t-${side}`} id={targetHandleId(side)} type="target" position={POSITION[side]} isConnectable={false} className="!opacity-0" />
        ))}
        <Icon name="collection" className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold leading-5 text-ink">{group.name}</div>
          <div className="flex items-center gap-1 text-[12px] text-ink-3">
            <Icon name={access.icon} size={11} />
            {access.label} · {countLabel}
          </div>
        </div>
        <CollapseButton id={id} collapsed name={group.name} />
      </div>
    )
  }

  return (
    <div
      className={`h-full w-full rounded-xl border-2 bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)] ${
        selected ? 'border-accent' : 'border-accent/30'
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={EMPTY_SIZE.width}
        minHeight={HEADER_HEIGHT + 60}
        color="var(--color-accent)"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm"
      />
      <div
        style={{ height: HEADER_HEIGHT }}
        className="collection-drag-handle flex cursor-grab items-center gap-2 rounded-t-[10px] border-b border-accent/20 bg-[color-mix(in_srgb,var(--color-accent)_9%,var(--color-surface))] px-3 active:cursor-grabbing"
      >
        <Icon name="collection" className="shrink-0 text-accent" />
        <span className="min-w-0 truncate text-[14px] font-bold text-ink" title={group.description || group.name}>
          {group.name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-ink-3" title={`${access.label}: ${access.hint}`}>
          <Icon name={access.icon} size={12} />
          <span className="sr-only">{access.label}</span>
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{countLabel}</span>
        <span className="flex-1" />
        <CollapseButton id={id} collapsed={false} name={group.name} />
      </div>
      {count === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-ink-3">No cards yet. Right-click here to add one.</p>
      ) : null}
    </div>
  )
}

export const CollectionNode = memo(CollectionNodeImpl)
