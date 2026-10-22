import { useEffect, useId, useRef, useState } from 'react'
import { useAuth, useAuthContext } from '../../auth/AuthContext'
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

/**
 * Account button pinned to the bottom of the sidebar. Opens a popover with
 * the account details, display settings and sign out.
 */
export function UserMenu() {
  const { handle, did } = useAuth()
  const { signOut } = useAuthContext()
  const profile = useProfile()
  const preferences = useUiStore((s) => s.preferences)
  const setPreference = useUiStore((s) => s.setPreference)
  const resetPreferences = useUiStore((s) => s.resetPreferences)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const displayName = profile.data?.displayName ?? handle
  const avatarUrl = profile.data?.avatarUrl

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('input, button')?.focus()
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

  return (
    <div ref={rootRef} className="relative shrink-0 border-t border-line p-2">
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Account and settings"
          className="absolute bottom-full left-2 right-2 mb-1 rounded-lg border border-line bg-surface shadow-xl"
        >
          <div className="flex items-center gap-3 border-b border-line px-3 py-3">
            <Avatar url={avatarUrl} name={displayName} size={36} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{displayName}</div>
              <div className="truncate text-[12px] text-ink-3">@{handle}</div>
            </div>
          </div>
          <div className="border-b border-line px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">DID</div>
            <div className="flex items-center gap-1">
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2" title={did}>
                {did}
              </code>
              <button
                type="button"
                aria-label={copied ? 'DID copied' : 'Copy DID'}
                title={copied ? 'Copied' : 'Copy DID'}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(did)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  } catch {
                    // Clipboard blocked: the DID is still visible and selectable.
                  }
                }}
              >
                <Icon name={copied ? 'check' : 'copy'} size={14} />
              </button>
            </div>
          </div>
          <fieldset className="space-y-2 border-b border-line px-3 py-3">
            <legend className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Settings
            </legend>
            <div role="radiogroup" aria-label="Collections on the canvas" className="space-y-1 text-[13px]">
              <div className="text-ink-2">Collections on the canvas</div>
              <div className="flex gap-1">
                {(
                  [
                    ['containers', 'Containers'],
                    ['flat', 'Flat'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                  >
                    <input
                      type="radio"
                      name="collection-presentation"
                      value={value}
                      checked={preferences.collectionPresentation === value}
                      onChange={() => setPreference('collectionPresentation', value)}
                      className="accent-[var(--color-accent)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={preferences.showEdgeLabels}
                onChange={(e) => setPreference('showEdgeLabels', e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              Always show connection labels
            </label>
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={preferences.showExternal}
                onChange={(e) => setPreference('showExternal', e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              <span>
                Show connected cards outside these collections
                <span className="block text-[12px] text-ink-3">Dashed cards at the far end of your connections.</span>
              </span>
            </label>
            <button type="button" className="text-[12px] text-accent hover:underline" onClick={resetPreferences}>
              Reset settings to defaults
            </button>
          </fieldset>
          <div className="p-1">
            <button
              type="button"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true)
                await signOut()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2 disabled:opacity-50"
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
