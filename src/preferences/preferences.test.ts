import { MemoryStore } from '../test/fakePds'
import { DEFAULTS, loadOverrides, loadPreferences, PREFERENCES_KEY, samePreferences, saveOverrides } from './preferences'

describe('preferences', () => {
  it('starts from the system defaults', () => {
    expect(loadPreferences(new MemoryStore())).toEqual(DEFAULTS)
  })

  it('stores only overrides, so a later change of default reaches users who never changed it', () => {
    const store = new MemoryStore()
    saveOverrides({ ...DEFAULTS, showMinimap: false }, store)
    expect(JSON.parse(store.getItem(PREFERENCES_KEY)!)).toEqual({ showMinimap: false })
    expect(loadPreferences(store)).toEqual({ ...DEFAULTS, showMinimap: false })
  })

  it('drops unknown keys and invalid values instead of failing', () => {
    const store = new MemoryStore()
    store.setItem(PREFERENCES_KEY, JSON.stringify({ showMinimap: 'yes', collectionPresentation: 'hub', removed: 1, showEdgeLabels: true }))
    expect(loadOverrides(store)).toEqual({ showEdgeLabels: true })
    store.setItem(PREFERENCES_KEY, '{not json')
    expect(loadPreferences(store)).toEqual(DEFAULTS)
  })

  it('keeps only connection types Semble knows', () => {
    const store = new MemoryStore()
    store.setItem(PREFERENCES_KEY, JSON.stringify({ defaultConnectionType: 'SUPPORTS', theme: 'dark', textSize: 'huge' }))
    expect(loadOverrides(store)).toEqual({ defaultConnectionType: 'SUPPORTS', theme: 'dark' })
    store.setItem(PREFERENCES_KEY, JSON.stringify({ defaultConnectionType: 'LIKES' }))
    expect(loadOverrides(store)).toEqual({})
  })

  it('compares whole preference sets (Save is disabled when nothing changed)', () => {
    expect(samePreferences(DEFAULTS, { ...DEFAULTS })).toBe(true)
    expect(samePreferences(DEFAULTS, { ...DEFAULTS, lineStyle: 'angled' })).toBe(false)
  })
})
