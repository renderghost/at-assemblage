import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { fetchProfile } from '../services/atproto/profile'
import type { ListResult, StoredRecord } from '../services/sources/records'
import {
  buildCollectionRecord,
  commitNewCard,
  createCollection,
  planNewCard,
  type NewCardInput,
  type NewCardPlan,
  type NewCollectionInput,
} from '../services/sources/semble/create'
import { fetchLibrary } from '../services/sources/semble/api'
import type { CollectionRecord, SembleLibrary } from '../services/sources/semble/types'
import { useUiStore } from '../state/uiStore'
import { queryKeys } from './keys'

export function useProfile() {
  const { client, did, pds } = useAuth()
  return useQuery({ queryKey: queryKeys.profile(did), queryFn: () => fetchProfile(client, did, pds), staleTime: Infinity })
}

/**
 * Adds a URL as a Semble card (or reuses the existing card for that URL),
 * with an optional note and collection links, in one atomic commit.
 * The new card is selected and focused once it appears on the canvas.
 */
export function useCreateCard() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.library(did)

  return useMutation<NewCardPlan, Error, NewCardInput & { position?: { x: number; y: number } }>({
    mutationFn: async (input) => {
      const library =
        queryClient.getQueryData<SembleLibrary>(key) ??
        (await queryClient.fetchQuery<SembleLibrary>({ queryKey: key, queryFn: () => fetchLibrary(client, did) }))
      return commitNewCard(client, await planNewCard(did, input, library))
    },
    onSuccess: (plan, { position }) => {
      // Recorded before the card reaches the cache, so the canvas places it here instead of auto-layout.
      if (position && !plan.existing) useUiStore.getState().placeNewCard(plan.cardRef.uri, position)
      const strip = <V,>({ rkey: _rkey, ...rest }: StoredRecord<V> & { rkey: string }): StoredRecord<V> => rest
      queryClient.setQueryData<SembleLibrary>(key, (old) =>
        old && {
          ...old,
          cards: [...old.cards, ...[plan.card, plan.note].filter((c) => !!c).map(strip)],
          links: [...old.links, ...plan.links.map(strip)],
        },
      )
      const { requestSelection, notify } = useUiStore.getState()
      // Zoom to it, unless the user chose where it goes or turned that off in Preferences.
      const focus = !position && useUiStore.getState().preferences.zoomToNewCards
      requestSelection({ nodes: [plan.cardRef.uri], edges: [] }, { focus })
      const added = plan.links.length
      notify({
        tone: 'success',
        message: plan.existing
          ? `Already in your library${added ? ` — added to ${added} collection${added === 1 ? '' : 's'}` : ''}.${plan.noteSkipped ? ' Your existing note was kept.' : ''}`
          : `Card added${added ? ` to ${added} collection${added === 1 ? '' : 's'}` : ' to your library'}.`,
      })
    },
  })
}

/** Creates a collection and ticks it in the sidebar so its cards (none yet) can be added. */
export function useCreateCollection() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.collections(did)

  return useMutation<StoredRecord<CollectionRecord>, Error, NewCollectionInput>({
    mutationFn: (input) => createCollection(client, buildCollectionRecord(input)),
    onSuccess: (saved) => {
      queryClient.setQueryData<ListResult<CollectionRecord>>(key, (old) => ({
        invalid: old?.invalid ?? 0,
        records: [...(old?.records ?? []), saved],
      }))
      const { selectedGroupIds, setSelectedGroupIds, notify } = useUiStore.getState()
      setSelectedGroupIds([...selectedGroupIds, saved.uri])
      notify({ tone: 'success', message: `Collection “${saved.value.name}” created.` })
    },
  })
}
