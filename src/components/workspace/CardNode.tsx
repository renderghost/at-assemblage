import { Handle, Position, useConnection, type Node, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { SIDES, sourceHandleId, targetHandleId, type Side } from '../../graph/edgeSides'
import type { GraphItem } from '../../graph/model'
import { NODE_WIDTH } from '../../graph/layout'
import { useUiStore } from '../../state/uiStore'
import { Icon } from '../ui/Icon'

export type CardNodeData = {
  item: GraphItem
  annotationCount: number
  /** Collection names to badge, only when more than one collection is loaded. */
  /** Collections to badge: all of them when several are shown flat, or the other ones in container mode. */
  groupBadges: { id: string; name: string }[]
}

export type CardNodeType = Node<CardNodeData, 'card'>

const POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

function Favicon({ domain }: { domain?: string }) {
  if (!domain) return <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-sm bg-line" />
  return (
    <img
      src={`https://${domain}/favicon.ico`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-4 w-4 shrink-0 rounded-sm"
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}

function CardNodeImpl({ id, data, selected }: NodeProps<CardNodeType>) {
  const { item, annotationCount, groupBadges } = data
  // While a connection (or a moved edge end) is dragged from another card, the whole card is a
  // drop target. Its handle type is the opposite of the end being dragged from.
  const dropType = useConnection((c) =>
    c.inProgress && c.fromNode.id !== id ? (c.fromHandle.type === 'source' ? 'target' : 'source') : null,
  )
  const isDropTarget = dropType !== null
  const notePreview = item.notes[0] ?? (item.kind === 'NOTE' ? undefined : item.description)

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={`group relative rounded-lg border px-3 py-2.5 shadow-sm transition-shadow ${
        item.external ? 'border-dashed bg-surface-2 opacity-85' : 'bg-surface'
      } ${
        selected ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-line-strong hover:shadow'
      } ${isDropTarget ? 'hover:border-accent hover:ring-2 hover:ring-accent/30' : ''}`}
    >
      {SIDES.map((side) => (
        // Edge anchor only: edges pick the nearest side (see chooseSides). Drops land on the
        // full-card overlay below, so these never need to be hit directly.
        <Handle
          key={`t-${side}`}
          id={targetHandleId(side)}
          type="target"
          position={POSITION[side]}
          isConnectableStart={false}
          className="!pointer-events-none !opacity-0"
        />
      ))}
      <div className="flex items-center gap-2 text-[11px] text-ink-3">
        <Favicon domain={item.domain} />
        <span className="truncate">{item.domain ?? (item.kind === 'NOTE' ? 'Note' : 'Card')}</span>
        {item.external ? (
          <span
            className="shrink-0 rounded border border-dashed border-line-strong px-1 py-px text-[10px] font-medium uppercase tracking-wide"
            title={item.external.label}
          >
            Outside
            <span className="sr-only">: {item.external.label}</span>
          </span>
        ) : null}
        {annotationCount > 0 ? (
          <span
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent"
            title={`${annotationCount} Margin note${annotationCount === 1 ? '' : 's'}`}
          >
            <Icon name="note" size={11} />
            {annotationCount}
            <span className="sr-only"> Margin notes</span>
          </span>
        ) : null}
      </div>
      <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-ink" title={item.url ?? item.title}>
        {item.title}
      </div>
      {notePreview ? <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink-2">{notePreview}</p> : null}
      {groupBadges.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {groupBadges.map((g) => (
            <button
              key={g.id}
              type="button"
              title={`Show ${g.name}`}
              onClick={(e) => {
                e.stopPropagation()
                useUiStore.getState().requestSelection({ nodes: [g.id], edges: [] })
              }}
              className="nodrag max-w-full truncate rounded border border-line px-1.5 py-px text-[10.5px] text-ink-3 hover:border-accent hover:text-accent"
            >
              {g.name}
            </button>
          ))}
        </div>
      ) : null}
      {SIDES.map((side) => (
        <Handle
          key={`s-${side}`}
          id={sourceHandleId(side)}
          type="source"
          position={POSITION[side]}
          title="Drag to another card to create a connection"
          aria-label={`Start a connection from ${item.title} (${side})`}
          className={`transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        />
      ))}
      {dropType ? (
        <Handle
          type={dropType}
          id="drop"
          position={Position.Left}
          className="!absolute !inset-0 !h-full !w-full !translate-none !transform-none !rounded-lg !border-0 !bg-transparent"
        />
      ) : null}
    </div>
  )
}

export const CardNode = memo(CardNodeImpl)
