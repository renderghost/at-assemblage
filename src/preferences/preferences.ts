import { z } from 'zod'
import { DEFAULT_CONNECTION_TYPE, typeInfo } from '../services/sources/semble/connectionTypes'

/**
 * User preferences. `DEFAULTS` is the system default for everyone and the one
 * place to change a default. Only a user's overrides are stored, so changing
 * a default here reaches everyone who hasn't changed that setting.
 *
 * To add a preference: add it to `SCHEMA` and `DEFAULTS`, then read it with
 * `useUiStore((s) => s.preferences.<key>)` and set it with `setPreference`.
 */
const SCHEMA = {
  // Appearance
  theme: z.enum(['system', 'light', 'dark']),
  textSize: z.enum(['normal', 'large', 'larger']),
  reduceMotion: z.enum(['system', 'always']),
  // Canvas
  /** How collections appear on the canvas. */
  collectionPresentation: z.enum(['containers', 'flat']),
  lineStyle: z.enum(['curved', 'straight', 'angled']),
  /** Always show connection labels (otherwise on hover or selection). */
  showEdgeLabels: z.boolean(),
  /** Show cards outside the selected collections that connections reach. */
  showExternal: z.boolean(),
  /** Show the minimap (it also hides itself when there isn't room). */
  showMinimap: z.boolean(),
  snapToGrid: z.boolean(),
  /** After adding a card, zoom the canvas to it. */
  zoomToNewCards: z.boolean(),
  // Connections
  /** Type a new connection starts on when there's no recommendation. */
  defaultConnectionType: z.string().refine((v) => !!typeInfo(v)),
  recommendedType: z.enum(['preselect', 'badge', 'off']),
  confirmDeleteConnections: z.enum(['always', 'several', 'never']),
  // Privacy & data
  /** Semble's public API: suggestions, others' cards and contributors, recommended types. */
  useSembleData: z.boolean(),
  /** Bluesky's link-card service, to prefill a new card's title. */
  linkPreviews: z.boolean(),
  /** Favicons, thumbnails and avatars loaded from other sites. */
  siteImages: z.boolean(),
} satisfies Record<string, z.ZodTypeAny>

export type Preferences = { [K in keyof typeof SCHEMA]: z.infer<(typeof SCHEMA)[K]> }
export type PreferenceKey = keyof Preferences

export const DEFAULTS: Preferences = {
  theme: 'system',
  textSize: 'normal',
  reduceMotion: 'system',
  collectionPresentation: 'containers',
  lineStyle: 'curved',
  showEdgeLabels: false,
  showExternal: true,
  showMinimap: true,
  snapToGrid: false,
  zoomToNewCards: true,
  defaultConnectionType: DEFAULT_CONNECTION_TYPE,
  recommendedType: 'preselect',
  confirmDeleteConnections: 'always',
  useSembleData: true,
  linkPreviews: true,
  siteImages: true,
}

/** True when two preference sets are identical. */
export function samePreferences(a: Preferences, b: Preferences): boolean {
  return (Object.keys(DEFAULTS) as PreferenceKey[]).every((k) => a[k] === b[k])
}

export const PREFERENCES_KEY = 'assemblage:preferences:v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

function storage(store?: Store): Store | null {
  if (store) return store
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Reads stored overrides, keeping only known keys whose values still validate. */
export function loadOverrides(store?: Store): Partial<Preferences> {
  let raw: unknown
  try {
    raw = JSON.parse(storage(store)?.getItem(PREFERENCES_KEY) ?? '{}')
  } catch {
    return {}
  }
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Record<PreferenceKey, unknown>> = {}
  for (const key of Object.keys(SCHEMA) as PreferenceKey[]) {
    const parsed = SCHEMA[key].safeParse((raw as Record<string, unknown>)[key])
    if (parsed.success) out[key] = parsed.data
  }
  return out as Partial<Preferences>
}

/** Stores only the values that differ from the defaults. */
export function saveOverrides(prefs: Preferences, store?: Store): void {
  const overrides = Object.fromEntries(
    (Object.keys(DEFAULTS) as PreferenceKey[]).filter((k) => prefs[k] !== DEFAULTS[k]).map((k) => [k, prefs[k]]),
  )
  try {
    storage(store)?.setItem(PREFERENCES_KEY, JSON.stringify(overrides))
  } catch {
    // Storage unavailable: the choice still holds for this session.
  }
}

export function loadPreferences(store?: Store): Preferences {
  return { ...DEFAULTS, ...loadOverrides(store) }
}
