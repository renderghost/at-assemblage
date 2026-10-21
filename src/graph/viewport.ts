import type { FitViewOptions } from '@xyflow/react'

/** The floating inspector: 320px wide, 16px from the canvas's top and right edges. */
export const INSPECTOR_WIDTH = 320
export const INSPECTOR_INSET = 16
/** Canvas width covered by the inspector plus a gap; things anchored right sit left of this. */
export const INSPECTOR_RESERVED = INSPECTOR_WIDTH + INSPECTOR_INSET + 12

/** Canvas width the minimap needs to sit beside the sidebar toggle and, when shown, the inspector. */
export const MINIMAP_MIN_FREE_WIDTH = 520

const px = (n: number) => `${n}px` as const

/** Fit everything, keeping clear of the inspector when it is showing. */
export function fitPadding(inspectorShown: boolean): FitViewOptions['padding'] {
  return { top: px(48), left: px(48), bottom: px(64), right: px((inspectorShown ? INSPECTOR_RESERVED : 0) + 32) }
}

/** Zoom to a few cards. A selection always shows the inspector. */
export const FOCUS_PADDING: FitViewOptions['padding'] = {
  top: px(96),
  left: px(96),
  bottom: px(96),
  right: px(INSPECTOR_RESERVED + 96),
}
