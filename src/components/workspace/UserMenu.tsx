import { useEffect, useId, useRef, useState } from 'react'
import { useAuth, useAuthContext } from '../../auth/AuthContext'
import { config } from '../../config'
import { useProfile } from '../../queries/create'
import { useUiStore } from '../../state/uiStore'
import { Icon } from '../ui/Icon'

function Avatar({ url, name, size }: { url?: string; name: string; size: number }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.replace(/^@/, '').charAt(0).toUpperCase()}
    </span>
  )
}

type LinkItem = { label: string; href: string }

/** Where an account lives on Bluesky, Semble and Margin. */
function profileLinks(handle: string, did: string): LinkItem[] {
  const named = handle && handle !== 'handle.invalid' ? handle : did
  return [
    { label: 'View on Bluesky', href: `${config.bskyWeb}/profile/${named}` },
    { label: 'View on Semble', href: `${config.sembleWeb}/profile/${named}` },
    { label: 'View on Margin', href: `${config.marginWeb}/profile/${did}` },
  ]
}

const ROW = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2 disabled:opacity-50'

function LinkList({ items, onPick }: { items: LinkItem[]; onPick: () => void }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.href}>
          <a href={item.href} target="_blank" rel="noopener noreferrer" className={ROW} onClick={onPick}>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <Icon name="external" size={14} className="shrink-0 text-ink-3" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/**
 * Account button pinned to the bottom of the sidebar. Opens a popover with
 * links to your profile and Assemblage's, Preferences and sign out.
 */
export function UserMenu() {
  const { handle, did } = useAuth()
  const { signOut } = useAuthContext()
  const profile = useProfile()
  const setPreferencesOpen = useUiStore((s) => s.setPreferencesOpen)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const displayName = profile.data?.displayName ?? handle
  const avatarUrl = profile.data?.avatarUrl

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={rootRef} className="relative shrink-0 border-t border-line p-2">
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Account"
          className="absolute bottom-full left-2 right-2 mb-1 rounded-lg border border-line bg-surface shadow-xl"
        >
          <section aria-label="Your profile" className="border-b border-line p-1">
            <div className="flex items-center gap-3 px-2 pb-2 pt-2">
              <Avatar url={avatarUrl} name={displayName} size={36} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{displayName}</div>
                <div className="truncate text-[12px] text-ink-3">@{handle}</div>
              </div>
            </div>
            <LinkList items={profileLinks(handle, did)} onPick={close} />
          </section>
          <section aria-labelledby={`${panelId}-assemblage`} className="border-b border-line p-1">
            <h3
              id={`${panelId}-assemblage`}
              className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3"
            >
              Assemblage
            </h3>
            <LinkList
              items={[
                ...profileLinks(config.assemblage.handle, config.assemblage.did),
                { label: 'Give feedback', href: config.feedbackUrl },
              ]}
              onPick={close}
            />
          </section>
          <div className="p-1">
            <button
              type="button"
              className={ROW}
              onClick={() => {
                close()
                setPreferencesOpen(true)
              }}
            >
              <Icon name="settings" />
              Preferences
            </button>
            <button
              type="button"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true)
                await signOut()
              }}
              className={ROW}
            >
              <Icon name="logout" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 aria-expanded:bg-surface-2"
      >
        <Avatar url={avatarUrl} name={displayName} size={28} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{displayName}</span>
        <Icon name="chevronUp" className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        <span className="sr-only">Account menu</span>
      </button>
    </div>
  )
}
