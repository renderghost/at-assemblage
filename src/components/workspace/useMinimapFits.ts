import { useStore } from '@xyflow/react'
import { INSPECTOR_RESERVED, MINIMAP_MIN_FREE_WIDTH } from '../../graph/viewport'
import { useUiStore } from '../../state/uiStore'

/** Whether the inspector is showing (it shows whenever something is selected). */
export function useInspectorShown() {
  return useUiStore((s) => s.selected.nodes.length + s.selected.edges.length > 0)
}

/** The minimap needs this much free canvas beside the inspector, if shown. */
export function useMinimapFits() {
  const width = useStore((s) => s.width)
  const inspectorShown = useInspectorShown()
  return width - (inspectorShown ? INSPECTOR_RESERVED : 0) >= MINIMAP_MIN_FREE_WIDTH
}
