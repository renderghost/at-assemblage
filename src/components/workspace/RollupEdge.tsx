import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { Icon } from '../ui/Icon'
import { edgePath } from './edgePath'

export type RollupEdgeData = { count: number; types: string[] }
export type RollupEdgeType = Edge<RollupEdgeData, 'rollup'>

/**
 * Connections to cards hidden inside a collapsed collection, drawn once from
 * the collection with a count. One type keeps that type's colour and icon;
 * mixed types are drawn neutral.
 */
function RollupEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<RollupEdgeType>) {
  const lineStyle = useUiStore((s) => s.preferences.lineStyle)
  const [path, labelX, labelY] = edgePath(lineStyle, { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  if (!data) return null
  const single = data.types.length === 1 ? styleForType(data.types[0] || undefined) : null
  const colour = single?.colour ?? 'var(--color-ink-3)'
  const label = data.count === 1 ? (single?.label ?? '1 connection') : `${data.count} connections`
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: colour, strokeWidth: 2 + Math.min(data.count - 1, 3), strokeDasharray: single?.dash, opacity: 0.85 }} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-[11px] font-medium text-ink shadow-sm"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, borderColor: colour }}
          title={data.types.map((t) => styleForType(t || undefined).label).join(', ')}
        >
          {single ? <Icon name={single.icon} size={11} style={{ color: colour }} /> : null}
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const RollupEdge = memo(RollupEdgeImpl)
