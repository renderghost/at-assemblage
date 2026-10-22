import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import type { GraphLink } from '../../graph/model'
import type { EdgeStyle } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { Icon } from '../ui/Icon'
import { edgePath } from './edgePath'

export type ConnectionEdgeData = {
  link?: GraphLink
  style: EdgeStyle
  /** Unsaved: either the drag draft or an optimistic write in flight. */
  pending?: boolean
  showLabel?: boolean
  hovered?: boolean
}

export type ConnectionEdgeType = Edge<ConnectionEdgeData, 'connection'>

function ConnectionEdgeImpl(props: EdgeProps<ConnectionEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, data } = props
  const lineStyle = useUiStore((s) => s.preferences.lineStyle)
  const [path, labelX, labelY] = edgePath(lineStyle, { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  if (!data) return null
  const { style, pending } = data
  const stroke = pending ? 'var(--color-accent)' : style.colour
  const visibleLabel = pending || selected || data.hovered || data.showLabel

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          stroke,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: pending ? '6 4' : style.dash,
          opacity: pending ? 0.85 : 1,
          animation: pending ? 'dashdraw 0.6s linear infinite' : undefined,
        }}
      />
      {visibleLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-[11px] font-medium shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: stroke,
              color: pending ? 'var(--color-accent)' : 'var(--color-ink)',
            }}
          >
            {pending ? null : <Icon name={style.icon} size={11} style={{ color: style.colour }} />}
            {pending ? (data.link ? 'Saving…' : 'New connection') : style.label}
            {!style.known && !pending ? <span className="ml-1 text-ink-3">(unknown type)</span> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

export const ConnectionEdge = memo(ConnectionEdgeImpl)
