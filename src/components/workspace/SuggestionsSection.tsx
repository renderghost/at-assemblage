import { useState } from 'react'
import type { GraphItem } from '../../graph/model'
import { useSuggestions } from '../../queries/suggestions'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import type { Suggestion } from '../../services/sources/semble/suggestions'
import { cleanUrl, domainOf } from '../../services/sources/url'
import { useUiStore } from '../../state/uiStore'
import { Button, Spinner } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { InspectorGroup, InspectorSection } from './InspectorSection'
import { PageCard } from './PageCard'
import { TypeSwatch } from './TypeSwatch'

const PREVIEW = 5

function curatorsText(s: Extract<Suggestion['reason'], { kind: 'connected' }>) {
  const [first, ...rest] = s.curators
  const name = first ? `@${first.handle}` : 'Someone'
  return rest.length ? `${name} and ${rest.length} other${rest.length === 1 ? '' : 's'}` : name
}

function SuggestionRow({ suggestion, card }: { suggestion: Suggestion; card: GraphItem & { url: string } }) {
  const setDraft = useUiStore((s) => s.setDraft)
  const openAddCard = useUiStore((s) => s.openAddCard)
  const { reason } = suggestion
  const connected = reason.kind === 'connected' ? reason : null
  const direction = connected?.direction ?? 'outgoing'
  const type = connected?.type

  const connect = () => {
    if (!suggestion.myCardId) return
    const [sourceId, targetId] = direction === 'outgoing' ? [card.id, suggestion.myCardId] : [suggestion.myCardId, card.id]
    setDraft({ sourceId, targetId, type })
  }
  const add = () =>
    openAddCard({
      url: suggestion.url,
      title: suggestion.title,
      description: suggestion.description,
      imageUrl: suggestion.imageUrl,
      collectionIds: card.groupIds,
      connectTo: { cardId: card.id, direction, type },
    })

  const label = connected ? styleForType(type).label : null
  return (
    <PageCard
      url={suggestion.url}
      imageUrl={suggestion.imageUrl}
      title={suggestion.title ?? cleanUrl(suggestion.url)}
      meta={`${suggestion.siteName ?? domainOf(suggestion.url) ?? ''}${suggestion.libraryCount > 0 ? ` · saved by ${suggestion.libraryCount}` : ''}`}
      action={
        suggestion.alreadyConnected ? (
          <span className="inline-flex h-7 items-center gap-1 text-[12px] text-success">
            <Icon name="check" size={13} /> Connected
          </span>
        ) : suggestion.myCardId ? (
          <Button size="sm" onClick={connect} title="Already in your library: connect it to this card">
            Connect
          </Button>
        ) : (
          <Button size="sm" icon="plus" onClick={add} title="Add this page as a card, then connect it">
            Add
          </Button>
        )
      }
    >
      {connected ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-2" title={connected.note}>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <TypeSwatch type={type} withIcon width={12} />
            {direction === 'outgoing' ? `${label} →` : `← ${label}`}
          </span>
          <span className="text-ink-3">by {curatorsText(connected)}</span>
        </div>
      ) : null}
    </PageCard>
  )
}

function Group({ title, hint, items, card }: { title: string; hint: string; items: Suggestion[]; card: GraphItem & { url: string } }) {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null
  const shown = expanded ? items : items.slice(0, PREVIEW)
  return (
    <InspectorGroup
      title={
        <span title={hint}>
          {title} <span className="font-normal text-ink-3">({items.length})</span>
        </span>
      }
    >
      <ul className="space-y-2">
        {shown.map((s) => (
          <SuggestionRow key={s.key} suggestion={s} card={card} />
        ))}
      </ul>
      {items.length > PREVIEW ? (
        <button type="button" className="text-[14px] text-accent hover:underline" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show fewer' : `Show ${items.length - PREVIEW} more`}
        </button>
      ) : null}
    </InspectorGroup>
  )
}

/**
 * Inspector section: what Semble knows about this card's URL. Pages other
 * people connected to it (with the relationship they used), then similar
 * pages. Pages already in the library offer Connect; new ones offer Add.
 */
export function SuggestionsSection({ card }: { card: GraphItem & { url: string } }) {
  const { groups, isLoading, error, partial, refetch, enabled } = useSuggestions(card.url)
  if (!enabled) return null

  const count = groups ? groups.connected.length + groups.similar.length : isLoading ? null : 0
  const empty = groups && count === 0
  return (
    <InspectorSection id="suggestions" title="Suggestions" count={count}>
      <div aria-busy={isLoading}>
        {isLoading ? (
          <InspectorGroup>
            <p className="text-ink-3">
              <Spinner label="Asking Semble…" />
            </p>
          </InspectorGroup>
        ) : error ? (
          <InspectorGroup>
            <div className="flex items-center gap-2 text-ink-3">
              <span>{error}</span>
              <button type="button" className="text-accent hover:underline" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          </InspectorGroup>
        ) : empty ? (
          <InspectorGroup>
            <p className="text-ink-3">Nobody on Semble has connected this page yet, and there are no similar pages.</p>
          </InspectorGroup>
        ) : groups ? (
          <>
            <Group
              title="Connected by others"
              hint="Pages other Semble users connected to or from this page"
              items={groups.connected}
              card={card}
            />
            <Group title="Similar pages" hint="Pages Semble finds similar to this one" items={groups.similar} card={card} />
            {partial ? (
              <InspectorGroup>
                <p className="text-[12px] text-warn">Some suggestions could not be loaded.</p>
              </InspectorGroup>
            ) : null}
          </>
        ) : null}
        <p className="border-t border-line px-4 py-2 text-[11.5px] leading-snug text-ink-3">
          From Semble's public data. This card's URL is sent to Semble to look it up.
        </p>
      </div>
    </InspectorSection>
  )
}
