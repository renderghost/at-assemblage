import { ConnectionLineType, getBezierPath, getSmoothStepPath, getStraightPath, type Position } from '@xyflow/react'
import type { Preferences } from '../../preferences/preferences'

type LineStyle = Preferences['lineStyle']

type Ends = { sourceX: number; sourceY: number; targetX: number; targetY: number; sourcePosition: Position; targetPosition: Position }

/** An edge's path in Preferences → Line style, with its label point: [path, labelX, labelY]. */
export function edgePath(lineStyle: LineStyle, ends: Ends): [string, number, number] {
  const [path, labelX, labelY] =
    lineStyle === 'straight'
      ? getStraightPath(ends)
      : lineStyle === 'angled'
        ? getSmoothStepPath({ ...ends, borderRadius: 8 })
        : getBezierPath(ends)
  return [path, labelX, labelY]
}

/** The line drawn while dragging out a new connection, in the same style. */
export const CONNECTION_LINE_TYPE: Record<LineStyle, ConnectionLineType> = {
  curved: ConnectionLineType.Bezier,
  straight: ConnectionLineType.Straight,
  angled: ConnectionLineType.SmoothStep,
}
