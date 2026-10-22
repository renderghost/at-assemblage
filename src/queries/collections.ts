import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { config } from '../config'
import { removeCollectionLayout } from '../graph/positions'
import { rkeyOf } from '../services/atproto/aturi'
import type { ListResult, StoredRecord } from '../services/sources/records'
import { fetchLibrary } from '../services/sources/semble/api'
import { fetchCollectionContributors, fetchCollectionPage } from '../services/sources/semble/appview'
import { applyRecordWrites } from '../services/sources/semble/cards'
import { planCollectionDeletion, updateCollection } from '../services/sources/semble/collections'
import type { NewCollectionInput } from '../services/sources/semble/create'
import type { CollectionRecord, SembleLibrary } from '../services/sources/semble/types'
import { useUiStore } from '../state/uiStore'
import { queryKeys } from './keys'

export function useUpdateCollection() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.collections(did)
  return useMutation<StoredRecord<CollectionRecord>, Error, { stored: StoredRecord<CollectionRecord>; input: NewCollectionInput }>({
    mutationFn: ({ stored, input }) => updateCollection(client, stored, input),
    onSuccess: (saved) => {
      queryClient.setQueryData<ListResult<CollectionRecord>>(key, (old) =>
        old && { ...old, records: old.records.map((r) => (r.uri === saved.uri ? saved : r)) },
      )
      useUiStore.getState().notify({ tone: 'success', message: `Collection “${saved.value.name}” updated.` })
    },
  })
}

/** Deletes a collection and your links to it (cards are kept), then tidies the canvas and caches. */
export function useDeleteCollection() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  return useMutation<void, Error, StoredRecord<CollectionRecord>>({
    mutationFn: async (collection) => {
      const libraryKey = queryKeys.library(did)
      const library = queryClient.getQueryData<SembleLibrary>(libraryKey) ?? (await fetchLibrary(client, did))
      const deletes = planCollectionDeletion(collection.uri, library)
      await applyRecordWrites(client, [], deletes)
      const gone = new Set(deletes)
      queryClient.setQueryData<SembleLibrary>(libraryKey, (old) => old && { ...old, links: old.links.filter((l) => !gone.has(l.uri)) })
      queryClient.setQueryData<ListResult<CollectionRecord>>(queryKeys.collections(did), (old) =>
        old && { ...old, records: old.records.filter((r) => r.uri !== collection.uri) },
      )
    },
    onSuccess: (_void, collection) => {
      const store = useUiStore.getState()
      store.setSelectedGroupIds(store.selectedGroupIds.filter((id) => id !== collection.uri))
      store.setSelected({ nodes: [], edges: [] })
      removeCollectionLayout(did, collection.uri)
      store.notify({ tone: 'success', message: `Collection “${collection.value.name}” deleted. Its cards are still in your library.` })
    },
    onError: () => {
      // A split batch may have partly landed: re-read the truth.
      void queryClient.invalidateQueries({ queryKey: queryKeys.library(did) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections(did) })
    },
  })
}

/**
 * Semble's public view of one of your collections: its id, card and follower
 * counts, cards other people added (Open collections), and contributors.
 */
export function useSembleCollection(collectionUri: string) {
  const { handle } = useAuth()
  return useQuery({
    queryKey: ['semble-api', 'collection', collectionUri],
    enabled: !!config.sembleApi,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const page = await fetchCollectionPage(handle, rkeyOf(collectionUri), { signal })
      const contributors = await fetchCollectionContributors(page.id, { signal }).catch(() => null)
      return { page, contributors }
    },
  })
}
