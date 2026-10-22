import { MemoryStore } from '../test/fakePds'
import { frecency, loadRecents, rankRecents, RECENTS_KEY, recordUse } from './recents'

const DAY = 24 * 60 * 60 * 1000

describe('recents', () => {
  it('counts uses and ranks by frecency: often beats once, but old use fades', () => {
    const store = new MemoryStore()
    const now = 100 * DAY
    recordUse('command:fit-view', now - 30 * DAY, store)
    recordUse('command:fit-view', now - 30 * DAY, store)
    recordUse('command:fit-view', now - 30 * DAY, store)
    recordUse('card:a', now - DAY, store)
    recordUse('card:b', now - 2 * DAY, store)
    recordUse('card:b', now - 2 * DAY, store)
    expect(rankRecents(loadRecents(store), now)).toEqual(['card:b', 'card:a', 'command:fit-view'])
    expect(frecency({ count: 2, last: now - 7 * DAY }, now)).toBeCloseTo(1)
  })

  it('survives bad stored data', () => {
    const store = new MemoryStore()
    store.setItem(RECENTS_KEY, '{"card:a":{"count":"x"},"card:b":{"count":1,"last":5}}')
    expect(loadRecents(store)).toEqual({ 'card:b': { count: 1, last: 5 } })
    store.setItem(RECENTS_KEY, 'nope')
    expect(loadRecents(store)).toEqual({})
  })
})
