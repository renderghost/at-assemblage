import { useState, type ReactNode } from 'react'
import { domainOf, isHttpUrl } from '../../services/sources/url'
import { useUiStore } from '../../state/uiStore'
import { Icon } from '../ui/Icon'

/** 56px square: the page's image, else its favicon on a tinted tile, else the domain's initial (or a note icon). */
function Thumbnail({ url, imageUrl, note }: { url?: string; imageUrl?: string; note?: boolean }) {
  const siteImages = useUiStore((s) => s.preferences.siteImages)
  const domain = domainOf(url)
  const sources = siteImages
    ? [imageUrl && isHttpUrl(imageUrl) ? imageUrl : null, domain ? `https://${domain}/favicon.ico` : null].filter((v): v is string => !!v)
    : []
  const [index, setIndex] = useState(0)
  const src = sources[index]
  const isFavicon = !!domain && src === `https://${domain}/favicon.ico`
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIndex((i) => i + 1)}
          className={isFavicon ? 'h-6 w-6' : 'h-full w-full object-cover'}
        />
      ) : note && !domain ? (
        <Icon name="note" size={20} className="text-ink-3" />
      ) : (
        <span aria-hidden="true" className="text-lg font-semibold uppercase text-ink-3">
          {(domain ?? '?').charAt(0)}
        </span>
      )}
    </div>
  )
}

/**
 * A page as a small card: thumbnail, title (two lines), a site line, optional
 * extra lines, and an action at the bottom right. Used by Suggestions and a
 * collection's Cards. The title opens the page in a new tab, or runs `onOpen`.
 */
export function PageCard({
  url,
  imageUrl,
  note,
  title,
  onOpen,
  meta,
  children,
  action,
}: {
  url?: string
  imageUrl?: string
  /** A note card (no page): shows a note icon instead of a site initial. */
  note?: boolean
  title: string
  onOpen?: () => void
  meta: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  const titleClass = 'line-clamp-2 text-left text-[13px] font-semibold leading-snug hover:underline'
  return (
    <li className="flex gap-3 rounded-lg border border-line bg-surface p-2.5">
      <Thumbnail url={url} imageUrl={imageUrl} note={note} />
      <div className="flex min-w-0 flex-1 flex-col">
        {onOpen ? (
          <button type="button" onClick={onOpen} className={titleClass}>
            {title}
          </button>
        ) : (
          <a href={url && isHttpUrl(url) ? url : undefined} target="_blank" rel="noopener noreferrer" className={titleClass} title={url}>
            {title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <div className="mt-0.5 truncate text-[11.5px] text-ink-3">{meta}</div>
        {children}
        {action ? <div className="mt-2 flex justify-end">{action}</div> : null}
      </div>
    </li>
  )
}
