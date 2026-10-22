import { useEffect } from 'react'
import { useUiStore } from '../state/uiStore'

/** Reflects the appearance preferences onto <html> so CSS (and the logo) can follow them. */
export function useApplyAppearance() {
  const theme = useUiStore((s) => s.preferences.theme)
  const textSize = useUiStore((s) => s.preferences.textSize)
  const reduceMotion = useUiStore((s) => s.preferences.reduceMotion)
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    if (textSize === 'normal') delete root.dataset.textSize
    else root.dataset.textSize = textSize
    if (reduceMotion === 'always') root.dataset.reduceMotion = ''
    else delete root.dataset.reduceMotion
  }, [theme, textSize, reduceMotion])
}

/** Animation length in ms, or 0 when motion is reduced (by preference or the system setting). */
export function motion(ms: number): number {
  if (useUiStore.getState().preferences.reduceMotion === 'always') return 0
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
  } catch {
    // ignore
  }
  return ms
}
