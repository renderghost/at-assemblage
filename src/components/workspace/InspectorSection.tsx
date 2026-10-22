import { useId, type ReactNode } from 'react'
import { useUiStore, type InspectorSection as SectionId } from '../../state/uiStore'
import { Icon } from '../ui/Icon'

type Props = {
  id: SectionId
  title: string
  /** Shown as "Title (n)"; omit for sections without a count, null while loading. */
  count?: number | null
  children: ReactNode
}

/**
 * One floating, independently collapsible card in the inspector stack.
 * Open/closed state is per section and remembered in this browser.
 */
export function InspectorSection({ id, title, count, children }: Props) {
  const open = useUiStore((s) => s.inspectorSections[id])
  const setOpen = useUiStore((s) => s.setInspectorSection)
  const contentId = useId()
  return (
    <section
      id={`inspector-${id}`}
      aria-label={title}
      className="ui-scale pointer-events-auto shrink-0 overflow-hidden rounded border border-line bg-surface shadow-sm"
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen(id, !open)}
          className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[16px] font-bold leading-6 text-ink hover:bg-surface-2"
        >
          <span className="min-w-0 truncate">
            {title}
            {count === undefined ? null : <span className="font-bold"> ({count ?? '…'})</span>}
          </span>
          <Icon name="chevronRight" className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </h2>
      {open ? (
        <div id={contentId} className="border-t border-line">
          {children}
        </div>
      ) : null}
    </section>
  )
}

/** A sub-group inside a section, separated by a rule (e.g. "Semble" / "Margin" under Notes). */
export function InspectorGroup({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-line p-4 text-[14px] leading-6 first:border-t-0">
      {title ? <h3 className="font-bold text-ink">{title}</h3> : null}
      {children}
    </div>
  )
}
