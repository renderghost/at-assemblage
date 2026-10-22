import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'

type Props = {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Disable closing via Escape/close button while a write is in flight. */
  locked?: boolean
  width?: string
  /** Sticky footer; with it, the body scrolls when the dialog hits the window's height. */
  footer?: ReactNode
}

/**
 * Native modal <dialog>: focus is trapped and restored by the browser, and
 * Escape closes it. Content only mounts while open so forms reset.
 */
export function Dialog({ open, title, description, onClose, children, locked, width = 'w-[460px]', footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      className={`${width} max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl m-auto open:flex open:flex-col`}
      onCancel={(e) => {
        e.preventDefault()
        if (!locked) onClose()
      }}
    >
      {open ? (
        <div className="ui-scale flex min-h-0 flex-1 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div>
              <h2 id="dialog-title" className="text-[15px] font-semibold">
                {title}
              </h2>
              {description ? <div className="mt-0.5 text-[13px] text-ink-3">{description}</div> : null}
            </div>
            <IconButton icon="close" label="Close dialog" onClick={onClose} disabled={locked} />
          </header>
          <div className={footer ? 'min-h-0 flex-1 overflow-y-auto px-5 py-4' : 'px-5 py-4'}>{children}</div>
          {footer ? <footer className="shrink-0 border-t border-line px-5 py-3">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  )
}
