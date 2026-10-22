import { MemoryStore } from '../test/fakePds'
import { DEFAULTS, loadOverrides, loadPreferences, PREFERENCES_KEY, saveOverrides } from './preferences'

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
})
