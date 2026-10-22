export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export const COMMAND_BAR_SHORTCUT = isMac ? '⌘K' : 'Ctrl+K'
export const NEW_CARD_SHORTCUT = 'N'

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'])

/** True when a key press is going into a text field, so single-key shortcuts should stay out of the way. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el?.closest) return false
  if (el.closest('textarea, select, [contenteditable="true"]')) return true
  const input = el.closest('input')
  return !!input && !NOT_TEXT.has(input.type)
}

/** A modal dialog or popover is open; global shortcuts wait. */
export function overlayOpen(): boolean {
  return !!document.querySelector('dialog[open], [role="dialog"], [role="menu"]')
}
