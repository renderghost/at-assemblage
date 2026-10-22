import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { config } from '../config'
import { network } from '../lexicons'
import { isAtUri } from '../services/atproto/aturi'
import { fetchConnectionsForUrl, fetchSimilarUrls, SembleApiError } from '../services/sources/semble/appview'
import { recommendType, type Resource } from '../services/sources/semble/recommendType'
import { buildSuggestions, connectionKey } from '../services/sources/semble/suggestions'
import { isHttpUrl, normaliseUrl } from '../services/sources/url'
import { useUiStore } from '../state/uiStore'
import { useConnections, useLibrary } from './semble'

const sembleKey = (kind: 'connections' | 'similar', url: string | undefined) =>
  ['semble-api', kind, url ? normaliseUrl(url) : null] as const

const SEMBLE_QUERY = { staleTime: 10 * 60_000, retry: 1 } as const

/** Whether to ask Semble's public API at all: configured, and allowed in Preferences → Privacy & data. */
export function useSembleData(): boolean {
  const allowed = useUiStore((s) => s.preferences.useSembleData)
  return !!config.sembleApi && allowed
}

/** Connections anyone made to or from this URL on Semble. Shared by suggestions and type recommendations. */
export function useSembleConnections(url: string | undefined) {
  const enabled = useSembleData()
  return useQuery({
    ...SEMBLE_QUERY,
    queryKey: sembleKey('connections', url),
    enabled: !!url && enabled,
    queryFn: ({ signal }) => fetchConnectionsForUrl(url!, { signal, limit: 100 }),
  })
}

function useSembleSimilar(url: string | undefined) {
  const enabled = useSembleData()
  return useQuery({
    ...SEMBLE_QUERY,
    queryKey: sembleKey('similar', url),
    enabled: !!url && enabled,
    queryFn: ({ signal }) => fetchSimilarUrls(url!, { signal }),
  })
}

/** Suggestions for one card URL, joined with the user's own library and connections. */
export function useSuggestions(url: string | undefined) {
  const { did } = useAuth()
  const enabled = useSembleData()
  const library = useLibrary()
  const connections = useConnections()
  const sembleConnections = useSembleConnections(url)
  const sembleSimilar = useSembleSimilar(url)

  const context = useMemo(() => {
    const myCards = new Map<string, string>()
    const urlByCard = new Map<string, string>()
    for (const c of library.data?.cards ?? []) {
      if (c.value.parentCard) continue
      const content = network.cosmik.card.urlContent.isTypeOf(c.value.content) ? c.value.content : undefined
      const cardUrl = c.value.url ?? content?.url
      if (!cardUrl) continue
      urlByCard.set(c.uri, cardUrl)
      if (!myCards.has(normaliseUrl(cardUrl))) myCards.set(normaliseUrl(cardUrl), c.uri)
    }
    const toUrl = (endpoint: string) => (isAtUri(endpoint) ? urlByCard.get(endpoint) : endpoint)
    const myConnectionKeys = new Set<string>()
    for (const c of connections.data?.connections ?? []) {
      const source = toUrl(c.value.source)
      const target = toUrl(c.value.target)
      if (source && target) myConnectionKeys.add(connectionKey(source, target, c.value.connectionType))
    }
    return { myCards, myConnectionKeys }
  }, [library.data, connections.data])

  // Each source may fail on its own; the other's results still show.
  const settled = !sembleConnections.isPending && !sembleSimilar.isPending
  const bothFailed = sembleConnections.isError && sembleSimilar.isError
  const groups = useMemo(
    () =>
      url && settled && !bothFailed
        ? buildSuggestions({ url, did, ...context }, sembleConnections.data ?? [], sembleSimilar.data ?? [])
        : null,
    [url, did, context, settled, bothFailed, sembleConnections.data, sembleSimilar.data],
  )
  const error = bothFailed ? sembleConnections.error : null

  return {
    groups,
    partial: settled && !bothFailed && (sembleConnections.isError || sembleSimilar.isError),
    isLoading: !settled && (sembleConnections.fetchStatus !== 'idle' || sembleSimilar.fetchStatus !== 'idle'),
    error: error ? (error instanceof SembleApiError ? error.message : 'Could not load suggestions.') : null,
    refetch: () => Promise.all([sembleConnections.refetch(), sembleSimilar.refetch()]),
    enabled,
  }
}

/**
 * A recommended connection type for source → target, only when the signal is
 * strong (see recommendType). Null while loading, when there is none, or when
 * Preferences → Recommended type is off.
 */
export function useTypeRecommendation(source: Resource | undefined, target: Resource | undefined) {
  const { did } = useAuth()
  const on = useUiStore((s) => s.preferences.recommendedType !== 'off')
  const sembleConnections = useSembleConnections(on && source?.url && isHttpUrl(source.url) ? source.url : undefined)
  return useMemo(
    () => (on && source && target ? recommendType(source, target, sembleConnections.data ?? [], did) : null),
    [on, source, target, sembleConnections.data, did],
  )
}
