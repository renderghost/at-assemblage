import { z } from 'zod'

/**
 * User preferences. `DEFAULTS` is the system default for everyone and the one
 * place to change a default. Only a user's overrides are stored, so changing
 * a default here reaches everyone who hasn't changed that setting.
 *
 * To add a preference: add it to `SCHEMA` and `DEFAULTS`, then read it with
 * `useUiStore((s) => s.preferences.<key>)` and set it with `setPreference`.
 */
const SCHEMA = {
  /** Always show connection labels (otherwise on hover or selection). */
  showEdgeLabels: z.boolean(),
  /** Show cards outside the selected collections that connections reach. */
  showExternal: z.boolean(),
  /** Show the minimap (it also hides itself when there isn't room). */
  showMinimap: z.boolean(),
  /** How collections appear on the canvas. */
  collectionPresentation: z.enum(['containers', 'flat']),
} satisfies Record<string, z.ZodTypeAny>

export type Preferences = { [K in keyof typeof SCHEMA]: z.infer<(typeof SCHEMA)[K]> }
export type PreferenceKey = keyof Preferences

export const DEFAULTS: Preferences = {
  showEdgeLabels: false,
  showExternal: true,
  showMinimap: true,
  collectionPresentation: 'containers',
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
