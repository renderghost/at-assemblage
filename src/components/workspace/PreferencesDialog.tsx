import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { config } from '../../config'
import { DEFAULTS, samePreferences, type PreferenceKey, type Preferences } from '../../preferences/preferences'
import { CONNECTION_TYPES } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { TypeSwatch } from './TypeSwatch'

type Option<V extends string> = { value: V; label: ReactNode; hint?: ReactNode }

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function Default() {
  return <span className="text-ink-3"> (default)</span>
}

/** One multiple-choice setting as a vertical radio list. */
function Choice<V extends string>({
  legend,
  hint,
  value,
  defaultValue,
  options,
  onChange,
}: {
  legend: string
  hint?: ReactNode
  value: V
  defaultValue: V
  options: Option<V>[]
  onChange: (value: V) => void
}) {
  const name = useId()
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[13px] font-medium">{legend}</legend>
      {hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
      <div className="space-y-1 pt-0.5">
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2 text-[13px]">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span className="min-w-0">
              {option.label}
              {option.value === defaultValue ? <Default /> : null}
              {option.hint ? <span className="block text-[12px] text-ink-3">{option.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** One on/off setting. */
function Toggle({
  label,
  hint,
  checked,
  defaultChecked,
  disabled,
  onChange,
}: {
  label: string
  hint?: ReactNode
  checked: boolean
  defaultChecked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={`flex items-start gap-2 text-[13px] ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="text-ink-3"> (default: {defaultChecked ? 'on' : 'off'})</span>
        {hint ? <span className="block text-[12px] text-ink-3">{hint}</span> : null}
      </span>
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-4 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 id={id} className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * Every setting on one page. Changes are drafted here and only applied (and
 * stored) on Save; Escape, the close button and "Exit without saving" drop them.
 */
export function PreferencesDialog() {
  const open = useUiStore((s) => s.preferencesOpen)
  const setOpen = useUiStore((s) => s.setPreferencesOpen)
  const current = useUiStore((s) => s.preferences)
  const setPreferences = useUiStore((s) => s.setPreferences)
  const formId = useId()

  // Start each visit from the saved preferences.
  const [draft, setDraft] = useState(current)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(current)
  }

  const set = <K extends PreferenceKey>(key: K, value: Preferences[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const choice = <K extends PreferenceKey>(key: K) => ({
    value: draft[key],
    defaultValue: DEFAULTS[key],
    onChange: (value: Preferences[K]) => set(key, value),
  })
  const toggle = (key: { [K in PreferenceKey]: Preferences[K] extends boolean ? K : never }[PreferenceKey]) => ({
    checked: draft[key],
    defaultChecked: DEFAULTS[key],
    onChange: (checked: boolean) => set(key, checked),
  })

  const unchanged = samePreferences(draft, current)
  const close = () => setOpen(false)
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!unchanged) setPreferences(draft)
    close()
  }

  return (
    <Dialog
      open={open}
      title="Preferences"
      description="Saved in this browser."
      onClose={close}
      width="w-[560px]"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Exit without saving</Button>
          <Button type="submit" form={formId} variant="primary" disabled={unchanged}>
            Save changes
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={save} className="space-y-6">
        <Section title="Appearance">
          <Choice
            legend="Theme"
            {...choice('theme')}
            options={[
              { value: 'system', label: 'Match system' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Choice
            legend="Text size"
            hint="For the sidebar, inspector, menus and dialogs. Zoom the canvas to resize cards."
            {...choice('textSize')}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Large' },
              { value: 'larger', label: 'Larger' },
            ]}
          />
          <Toggle
            label="Always reduce motion"
            hint="Turns off animated zooms and transitions. Your system's reduce-motion setting is always respected."
            checked={draft.reduceMotion === 'always'}
            defaultChecked={DEFAULTS.reduceMotion === 'always'}
            onChange={(on) => set('reduceMotion', on ? 'always' : 'system')}
          />
        </Section>

        <Section title="Canvas">
          <Choice
            legend="Collections on the canvas"
            {...choice('collectionPresentation')}
            options={[
              { value: 'containers', label: 'Containers', hint: 'Each collection is a box holding its cards.' },
              { value: 'flat', label: 'Flat', hint: 'Cards only, laid out by their connections.' },
            ]}
          />
          <Choice
            legend="Line style"
            {...choice('lineStyle')}
            options={[
              { value: 'curved', label: 'Curved' },
              { value: 'straight', label: 'Straight' },
              { value: 'angled', label: 'Angled' },
            ]}
          />
          <div className="space-y-2.5">
            <Toggle
              label="Always show connection labels"
              hint="Otherwise a label shows when you hover over or select its connection."
              {...toggle('showEdgeLabels')}
            />
            <Toggle
              label="Show connected cards outside these collections"
              hint="Dashed cards at the far end of your connections."
              {...toggle('showExternal')}
            />
            <Toggle label="Show minimap" hint="It also hides itself when the window is too small." {...toggle('showMinimap')} />
            <Toggle label="Snap cards to the grid" {...toggle('snapToGrid')} />
            <Toggle label="Zoom to new cards" hint="After adding a card, move the canvas to it." {...toggle('zoomToNewCards')} />
          </div>
        </Section>

        <Section title="Connections">
          <Choice
            legend="Default connection type"
            hint="What a new connection starts as when there's no recommendation."
            {...choice('defaultConnectionType')}
            options={CONNECTION_TYPES.map((t) => ({
              value: t.value,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <TypeSwatch type={t.value} withIcon width={14} />
                  {t.label}
                </span>
              ),
              hint: t.description,
            }))}
          />
          <Choice
            legend="Recommended type"
            hint="Based on how others on Semble connected the same two pages, or when both are clearly the same thing (a shared DOI, say)."
            {...choice('recommendedType')}
            options={[
              { value: 'preselect', label: 'Choose it for me' },
              { value: 'badge', label: 'Only mark it as recommended' },
              { value: 'off', label: "Don't recommend a type" },
            ]}
          />
          <Choice
            legend="Confirm before deleting connections"
            {...choice('confirmDeleteConnections')}
            options={[
              { value: 'always', label: 'Always' },
              { value: 'several', label: 'Only when deleting several at once' },
              { value: 'never', label: 'Never' },
            ]}
          />
        </Section>

        <Section title="Privacy & data">
          <p className="text-[12px] text-ink-3">
            Your records are only ever read from and written to your own PDS. These services are optional.
          </p>
          <div className="space-y-2.5">
            <Toggle
              label="Use Semble's public data"
              hint={
                config.sembleApi ? (
                  <>
                    Suggestions, recommended connection types and collection contributors. Sends the URL of the card you
                    select, and the collection you select, to Semble ({hostOf(config.sembleApi)}).
                  </>
                ) : (
                  'Not available in this version of Assemblage.'
                )
              }
              disabled={!config.sembleApi}
              {...toggle('useSembleData')}
            />
            <Toggle
              label="Link previews"
              hint={
                config.linkPreviewService ? (
                  <>
                    Fills in a new card's title and description. Sends the URL you're adding to Bluesky's link-card
                    service ({hostOf(config.linkPreviewService)}).
                  </>
                ) : (
                  'Not available in this version of Assemblage.'
                )
              }
              disabled={!config.linkPreviewService}
              {...toggle('linkPreviews')}
            />
            <Toggle
              label="Load site icons and images"
              hint="Favicons, page thumbnails and people's avatars load from the sites they belong to, which can see your IP address."
              {...toggle('siteImages')}
            />
          </div>
        </Section>

        <div className="border-t border-line pt-4">
          <button type="button" className="text-[13px] text-accent hover:underline" onClick={() => setDraft({ ...DEFAULTS })}>
            Reset settings to defaults
          </button>
        </div>
      </form>
    </Dialog>
  )
}
