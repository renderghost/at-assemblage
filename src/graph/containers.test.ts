import {
  EMPTY_SIZE,
  fitChildren,
  HEADER_HEIGHT,
  packGroups,
  PADDING,
  placeNewCards,
  primaryGroups,
  rollupLinks,
  wrapChildren,
} from './containers'
import type { GraphItem } from './model'

const item = (id: string, groupIds: string[], external = false): GraphItem => ({
  id,
  kind: 'URL',
  title: id,
  notes: [],
  groupIds,
  endpoints: [],
  ...(external ? { external: { label: 'x' } } : {}),
})
const card = (x: number, y: number) => ({ x, y, width: 260, height: 80 })

describe('primaryGroups', () => {
  it('puts each card in the first shown collection it belongs to; external cards in none', () => {
    const map = primaryGroups([item('a', ['B', 'A']), item('b', ['C']), item('x', [], true)], ['A', 'B'])
    expect(Object.fromEntries(map)).toEqual({ a: 'A' })
  })
})

describe('wrapChildren', () => {
  it('grows to wrap cards with padding, never shrinking', () => {
    const w = wrapChildren({ x: 100, y: 100 }, { width: 900, height: 600 }, [card(PADDING, HEADER_HEIGHT + PADDING)])
    expect(w).toEqual({ origin: { x: 100, y: 100 }, size: { width: 900, height: 600 }, shift: { x: 0, y: 0 } })
    const grown = wrapChildren({ x: 0, y: 0 }, { width: 400, height: 200 }, [card(300, 200)])
    expect(grown.size).toEqual({ width: 300 + 260 + PADDING, height: 200 + 80 + PADDING })
  })

  it('moves its origin out (and shifts cards back) when a card goes past the left or top', () => {
    const w = wrapChildren({ x: 100, y: 100 }, { width: 400, height: 300 }, [card(-50, 10)])
    expect(w.shift).toEqual({ x: PADDING + 50, y: HEADER_HEIGHT + PADDING - 10 })
    expect(w.origin).toEqual({ x: 100 - w.shift.x, y: 100 - w.shift.y })
    expect(w.size.width).toBe(400 + w.shift.x)
  })

  it('gives an empty collection a minimum size', () => {
    expect(wrapChildren({ x: 0, y: 0 }, undefined, []).size).toEqual(EMPTY_SIZE)
  })
})

describe('fitChildren', () => {
  it('wraps the cards exactly with padding, shrinking if needed', () => {
    const f = fitChildren({ x: 0, y: 0 }, [card(200, 300), card(600, 300)])
    expect(f.shift).toEqual({ x: PADDING - 200, y: HEADER_HEIGHT + PADDING - 300 })
    expect(f.size).toEqual({ width: 660 + 2 * PADDING, height: 80 + HEADER_HEIGHT + 2 * PADDING })
    expect(f.origin).toEqual({ x: 200 - PADDING, y: 300 - PADDING - HEADER_HEIGHT })
  })
})

describe('placeNewCards', () => {
  it('starts under the header when empty, otherwise below the existing cards, three to a row', () => {
    const size = { width: 260, height: 120 }
    expect(placeNewCards([], 1, size)[0]).toEqual({ x: PADDING, y: HEADER_HEIGHT + PADDING })
    const placed = placeNewCards([card(PADDING, 100)], 4, size)
    expect(placed.map((p) => p.y)).toEqual([212, 212, 212, 212 + 120 + 32])
    expect(placed[3]!.x).toBe(PADDING)
  })
})

describe('packGroups', () => {
  it('places new containers to the right of existing ones without overlapping', () => {
    const placed = [{ x: 0, y: 0, width: 500, height: 400 }]
    const out = packGroups(placed, [
      { id: 'a', size: { width: 400, height: 300 } },
      { id: 'b', size: { width: 400, height: 300 } },
    ])
    expect(out.a!.x).toBeGreaterThanOrEqual(500)
    expect(out.b!.x).toBeGreaterThan(out.a!.x + 400)
  })

  it('wraps into a new row instead of one long strip', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `g${i}`, size: { width: 900, height: 500 } }))
    const out = packGroups([], many)
    expect(new Set(Object.values(out).map((p) => p.y)).size).toBeGreaterThan(1)
    expect(Math.max(...Object.values(out).map((p) => p.x))).toBeLessThan(3000)
  })
})

describe('rollupLinks', () => {
  const links = [
    { id: '1', sourceId: 'a', targetId: 'x', type: 'SUPPORTS' },
    { id: '2', sourceId: 'b', targetId: 'x', type: 'RELATED' },
    { id: '3', sourceId: 'a', targetId: 'b', type: 'RELATED' },
    { id: '4', sourceId: 'x', targetId: 'y' },
  ]

  it('redraws connections to hidden cards from the collection, merged per end and direction', () => {
    const { links: kept, rollups } = rollupLinks(links, new Map([['a', 'G'], ['b', 'G']]))
    expect(kept.map((l) => l.id)).toEqual(['4'])
    expect(rollups).toEqual([{ id: 'rollup:G->x', sourceId: 'G', targetId: 'x', linkIds: ['1', '2'], types: ['SUPPORTS', 'RELATED'] }])
  })

  it('keeps everything when nothing is collapsed', () => {
    expect(rollupLinks(links, new Map()).links).toHaveLength(4)
  })
})
