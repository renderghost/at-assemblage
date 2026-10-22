import { useState, type ReactNode } from 'react'
import type { Preview } from '../../commands/types'
import type { GraphGroup } from '../../graph/model'
import type { LinkPreview } from '../../services/linkPreview'
import { styleForType, typeInfo } from '../../services/sources/semble/connectionTypes'
import { cleanUrl, domainOf, isHttpUrl } from '../../services/sources/url'
import { useUiStore } from '../../state/uiStore'
import { Spinner } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { TypeSwatch } from '../workspace/TypeSwatch'
import { Keys } from './Keys'

function Image({ src }: { src?: string }) {
  const siteImages = useUiStore((s) => s.preferences.siteImages)
  const [failed, setFailed] = useState<string | null>(null)
  if (!siteImages || !src || !isHttpUrl(src) || failed === src) return null
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
      className="mb-3 aspect-[1200/630] w-full rounded-md border border-line bg-surface-2 object-cover"
    />
  )
}

function Status({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' }) {
  return <p className={`mt-3 border-t border-line pt-3 text-[12px] leading-snug ${tone === 'accent' ? 'text-accent' : 'text-ink-3'}`}>{children}</p>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-0.5 text-[13px] leading-snug text-ink-2">{children}</div>
    </div>
  )
}

/** The right-hand pane: what the highlighted row is, before you choose it. */
export function CommandPreview({ preview, groups, link }: { preview?: Preview; groups: GraphGroup[]; link: { loading: boolean; preview: LinkPreview | null } }) {
  if (!preview) return null
  const names = (ids: string[]) => {
    const byId = new Map(groups.map((g) => [g.id, g.name]))
    return ids.map((id) => byId.get(id)).filter(Boolean) as string[]
  }

  switch (preview.kind) {
    case 'card': {
      const { item, collectionIds, marginNotes, connectionCount } = preview.entry
      const inCollections = names(collectionIds)
      return (
        <div>
          <Image src={item.imageUrl} />
          <div className="truncate text-[12px] text-ink-3">{item.siteName ?? item.domain ?? (item.kind === 'NOTE' ? 'Note card' : 'Card')}</div>
          <h3 className="text-[15px] font-semibold leading-snug">{item.title}</h3>
          {item.description && item.kind !== 'NOTE' ? <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-ink-2">{item.description}</p> : null}
          <Fact label="Collections">{inCollections.length ? inCollections.join(', ') : 'None'}</Fact>
          {item.notes[0] ? <Fact label="Note">{<span className="line-clamp-3">{item.notes[0]}</span>}</Fact> : null}
          <Fact label="Links">
            {connectionCount} connection{connectionCount === 1 ? '' : 's'}
            {marginNotes.length ? ` · ${marginNotes.length} Margin note${marginNotes.length === 1 ? '' : 's'}` : ''}
          </Fact>
          {preview.onCanvas ? (
            <Status tone="accent">On the canvas.</Status>
          ) : collectionIds.length ? (
            <Status>Not on the canvas. Enter shows it, adding {inCollections.length === 1 ? 'its collection' : 'its collections'}.</Status>
          ) : (
            <Status>Not in any collection, so it can't be shown on the canvas. Edit it to add it to one.</Status>
          )}
        </div>
      )
    }
    case 'collection': {
      const { group } = preview.entry
      const count = group.itemCount ?? 0
      return (
        <div>
          <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon name="collection" size={18} />
          </div>
          <h3 className="text-[15px] font-semibold leading-snug">{group.name}</h3>
          {group.description ? <p className="mt-1 line-clamp-4 text-[13px] leading-snug text-ink-2">{group.description}</p> : null}
          <Fact label="Cards">{count}</Fact>
          <Fact label="Collaboration">{group.accessType === 'OPEN' ? 'Open: anyone can add cards' : 'Personal'}</Fact>
          {preview.shown ? <Status tone="accent">On the canvas.</Status> : <Status>Not on the canvas. Enter adds it.</Status>}
        </div>
      )
    }
    case 'connection': {
      const { link: l } = preview
      const style = styleForType(l.type)
      return (
        <div>
          <div className="text-[13px] font-semibold leading-snug">{l.sourceTitle}</div>
          <div className="my-1.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: style.colour }}>
            <TypeSwatch type={l.type} withIcon width={16} />
            {style.label}
          </div>
          <div className="text-[13px] font-semibold leading-snug">{l.targetTitle}</div>
          {l.note ? <Fact label="Note">{<span className="line-clamp-6 whitespace-pre-line">{l.note}</span>}</Fact> : null}
          {preview.draft ? (
            <Status>{preview.draft}</Status>
          ) : preview.onCanvas ? (
            <Status tone="accent">On the canvas.</Status>
          ) : (
            <Status>Not on the canvas. Enter shows it.</Status>
          )}
        </div>
      )
    }
    case 'command':
      return (
        <div>
          <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
            <Icon name={preview.icon} size={18} />
          </div>
          <h3 className="text-[15px] font-semibold leading-snug">{preview.title}</h3>
          {preview.description ? <p className="mt-1 text-[13px] leading-snug text-ink-2">{preview.description}</p> : null}
          {preview.current ? <Fact label="Current">{preview.current.replace(/^Now: /, '')}</Fact> : null}
          {preview.shortcut ? (
            <Fact label="Shortcut">
              <Keys keys={preview.shortcut} />
            </Fact>
          ) : null}
        </div>
      )
    case 'url':
      return (
        <div>
          {link.loading ? (
            <p className="mb-3 text-[12px] text-ink-3">
              <Spinner label="Fetching a preview…" />
            </p>
          ) : null}
          <Image src={link.preview?.imageUrl} />
          <div className="truncate text-[12px] text-ink-3">{domainOf(preview.url)}</div>
          <h3 className="text-[15px] font-semibold leading-snug">{link.preview?.title ?? cleanUrl(preview.url)}</h3>
          {link.preview?.description ? <p className="mt-1 line-clamp-4 text-[13px] leading-snug text-ink-2">{link.preview.description}</p> : null}
          {preview.existing ? (
            <Status>Already in your library as “{preview.existing.item.title}”. Adding it again only adds it to more collections.</Status>
          ) : (
            <Status>Enter opens the add-card form with this link, so you can choose collections and add a note.</Status>
          )}
        </div>
      )
    case 'type': {
      const info = typeInfo(preview.type)
      const style = styleForType(preview.type)
      return (
        <div>
          <div className="mb-2 flex items-center gap-2" style={{ color: style.colour }}>
            <TypeSwatch type={preview.type} withIcon width={28} />
          </div>
          <h3 className="text-[15px] font-semibold leading-snug">{style.label}</h3>
          {info ? <p className="mt-1 text-[13px] leading-snug text-ink-2">{info.description}</p> : null}
          {preview.reason ? (
            <Status tone="accent">
              <Icon name="sparkle" size={12} className="mr-1 inline" />
              Recommended: {preview.reason}
            </Status>
          ) : null}
        </div>
      )
    }
  }
}
