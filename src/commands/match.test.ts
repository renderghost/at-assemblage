import { fold, matchFields, matchToken, snippet } from './match'

describe('matchToken', () => {
  it('ranks the start of the text, then a word start, then a substring, then letters in order', () => {
    const prefix = matchToken('rad', 'Radio ghost')!
    const word = matchToken('gho', 'Radio ghost')!
    const sub = matchToken('dio', 'Radio ghost')!
    const fuzzy = matchToken('rdgh', 'Radio ghost', true)!
    expect(prefix.score).toBeGreaterThan(word.score)
    expect(word.score).toBeGreaterThan(sub.score)
    expect(sub.score).toBeGreaterThan(fuzzy.score)
    expect(prefix.ranges).toEqual([[0, 3]])
    expect(word.ranges).toEqual([[6, 9]])
    expect(fuzzy.ranges).toEqual([[0, 1], [2, 3], [6, 8]])
  })

  it('prefers a later word start over an earlier mid-word match', () => {
    expect(matchToken('host', 'ghost host')!.ranges).toEqual([[6, 10]])
  })

  it('only matches letters in order when asked, and not when they are spread far apart', () => {
    expect(matchToken('rdgh', 'Radio ghost')).toBeNull()
    expect(matchToken('ax', 'a long sentence that eventually has an x', true)).toBeNull()
  })

  it('ignores case and accents without shifting positions', () => {
    expect(fold('Café Ünïcode')).toBe('cafe unicode')
    expect(matchToken('cafe', 'Le Café')!.ranges).toEqual([[3, 7]])
  })
})

describe('matchFields', () => {
  const fields = [
    { key: 'title', text: 'Zoning reform explained', weight: 1, fuzzy: true },
    { key: 'domain', text: 'example.org', weight: 0.8 },
    { key: 'note', text: 'Great primer on parking minimums', weight: 0.5 },
  ]

  it('needs every word to match somewhere', () => {
    expect(matchFields('zoning parking', fields)!.ranges).toEqual({ title: [[0, 6]], note: [[16, 23]] })
    expect(matchFields('zoning bicycles', fields)).toBeNull()
  })

  it('weights fields and reports the one that contributed most', () => {
    const inTitle = matchFields('reform', fields)!
    const inNote = matchFields('primer', fields)!
    expect(inTitle.score).toBeGreaterThan(inNote.score)
    expect(inNote.best).toBe('note')
  })
})

describe('snippet', () => {
  it('cuts long text around the match and shifts the ranges', () => {
    const text = `${'word '.repeat(40)}needle ${'more '.repeat(40)}`
    const at = text.indexOf('needle')
    const s = snippet(text, [[at, at + 6]], 60)
    expect(s.text.startsWith('…')).toBe(true)
    expect(s.text.endsWith('…')).toBe(true)
    const [start, end] = s.ranges[0]!
    expect(s.text.slice(start, end)).toBe('needle')
  })

  it('collapses whitespace', () => {
    const s = snippet('a\n\n  needle', [[5, 11]])
    expect(s.text).toBe('a needle')
    expect(s.text.slice(...s.ranges[0]!)).toBe('needle')
  })
})
