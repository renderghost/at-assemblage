import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { describeError } from '../services/atproto/errors'
import type { StoredRecord } from '../services/sources/records'
import { fetchLibrary } from '../services/sources/semble/api'
import { applyRecordWrites, planCardDeletion, planCollectionChanges } from '../services/sources/semble/cards'
import type { CardRecord, CollectionRecord, SembleConnections, SembleLibrary } from '../services/sources/semble/types'
import { useUiStore } from '../state/uiStore'
import { queryKeys } from './keys'

/** Sets exactly which collections a card is in (adds and removes collectionLinks in one commit). */
export function useUpdateCardCollections() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.library(did)
  return useMutation<{ added: number; removed: number }, Error, { card: StoredRecord<CardRecord>; collections: StoredRecord<CollectionRecord>[] }>({
    mutationFn: async ({ card, collections }) => {
      const library = queryClient.getQueryData<SembleLibrary>(key) ?? (await fetchLibrary(client, did))
      const { creates, deletes } = await planCollectionChanges(did, card, collections, library)
      if (creates.length + deletes.length > 0) await applyRecordWrites(client, creates, deletes)
      const removed = new Set(deletes)
      queryClient.setQueryData<SembleLibrary>(key, (old) =>
        old && {
          ...old,
          links: [...old.links.filter((l) => !removed.has(l.uri)), ...creates.map(({ rkey: _rkey, ...rest }) => rest)],
        },
      )
      return { added: creates.length, removed: deletes.length }
    },
    onSuccess: ({ added, removed }) => {
      if (added + removed === 0) return
      const parts = [added ? `added to ${added}` : '', removed ? `removed from ${removed}` : ''].filter(Boolean)
      useUiStore.getState().notify({ tone: 'success', message: `Card ${parts.join(' and ')} collection${added + removed === 1 ? '' : 's'}.` })
    },
    onError: (err) => useUiStore.getState().notify({ tone: 'error', message: `Collections not updated. ${describeError(err).message}` }),
  })
}

/**
 * Deletes a card with its note(s) and collection links, and optionally the
 * connections touching it. The card itself is deleted last, so if a large
 * batch is split across commits and fails, the card is never left without
 * its pieces being cleaned up first.
 */
export function useDeleteCard() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const libraryKey = queryKeys.library(did)
  const connectionsKey = queryKeys.connections(did)
  return useMutation<void, Error, { card: StoredRecord<CardRecord>; includeConnections: boolean }>({
    mutationFn: async ({ card, includeConnections }) => {
      const library = queryClient.getQueryData<SembleLibrary>(libraryKey) ?? (await fetchLibrary(client, did))
      const connections = queryClient.getQueryData<SembleConnections>(connectionsKey)?.connections ?? []
      const plan = planCardDeletion(card, library, connections)
      const deletes = [...(includeConnections ? plan.connections : []), ...plan.links, ...plan.notes, plan.card]
      await applyRecordWrites(client, [], deletes)
      const gone = new Set(deletes)
      queryClient.setQueryData<SembleLibrary>(libraryKey, (old) =>
        old && { ...old, cards: old.cards.filter((c) => !gone.has(c.uri)), links: old.links.filter((l) => !gone.has(l.uri)) },
      )
      queryClient.setQueryData<SembleConnections>(connectionsKey, (old) =>
        old && { ...old, connections: old.connections.filter((c) => !gone.has(c.uri)) },
      )
    },
    onSuccess: () => {
      useUiStore.getState().setSelected({ nodes: [], edges: [] })
      useUiStore.getState().notify({ tone: 'success', message: 'Card deleted.' })
    },
    onError: (err) => {
      // A split batch may have partly landed: re-read the truth.
      void queryClient.invalidateQueries({ queryKey: libraryKey })
      void queryClient.invalidateQueries({ queryKey: connectionsKey })
      useUiStore.getState().notify({ tone: 'error', message: `Card not deleted. ${describeError(err).message}` })
    },
  })
}
