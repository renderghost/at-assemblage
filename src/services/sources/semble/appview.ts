import { z } from 'zod'
import { config } from '../../../config'

/**
 * Client for Semble's public AppView API (`/xrpc/network.cosmik.*`). These
 * read endpoints have open CORS and need no authentication; only the URL
 * being looked up is sent. Response shapes mirror Semble's own zod schemas
 * (cosmik-network/semble src/types), validated leniently: entries that do
 * not parse are dropped rather than failing the whole response.
 */

const UrlMetadata = z
  .object({
    url: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    siteName: z.string().optional(),
    imageUrl: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough()

const UrlView = z
  .object({
    url: z.string(),
    metadata: UrlMetadata.optional(),
    urlLibraryCount: z.number().optional(),
  })
  .passthrough()

const User = z.object({ id: z.string(), name: z.string().optional(), handle: z.string(), avatarUrl: z.string().optional() }).passthrough()

const ConnectionView = z
  .object({
    connection: z
      .object({ id: z.string(), type: z.string().optional(), note: z.string().optional(), curator: User })
      .passthrough(),
    source: UrlView,
    target: UrlView,
  })
  .passthrough()

export type SembleUrlView = z.infer<typeof UrlView>
export type SembleUser = z.infer<typeof User>
export type SembleConnectionView = z.infer<typeof ConnectionView>

export class SembleApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SembleApiError'
  }
}

type Options = { fetch?: typeof globalThis.fetch; signal?: AbortSignal; base?: string }

async function get(nsid: string, params: Record<string, string | number>, opts: Options): Promise<unknown> {
  const base = (opts.base ?? config.sembleApi).replace(/\/+$/, '')
  if (!base) throw new SembleApiError('Semble suggestions are turned off.')
  const url = new URL(`${base}/xrpc/${nsid}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const fetchFn = opts.fetch ?? globalThis.fetch
  let res: Response
  try {
    // A plain GET with no custom headers: no CORS preflight, no credentials.
    res = await fetchFn(url.toString(), { signal: opts.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new SembleApiError('Could not reach Semble.')
  }
  if (!res.ok) throw new SembleApiError(`Semble returned an error (${res.status}).`, res.status)
  try {
    return await res.json()
  } catch {
    throw new SembleApiError('Semble returned an unreadable response.')
  }
}

function parseList<T>(raw: unknown, key: string, item: z.ZodType<T>): T[] {
  const list = (raw as Record<string, unknown> | null)?.[key]
  if (!Array.isArray(list)) throw new SembleApiError('Semble returned an unexpected response.')
  return list.flatMap((entry) => {
    const parsed = item.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/** `network.cosmik.search.getSimilarUrls`: pages semantically similar to `url` across Semble. */
export async function fetchSimilarUrls(url: string, opts: Options & { limit?: number } = {}): Promise<SembleUrlView[]> {
  const raw = await get('network.cosmik.search.getSimilarUrls', { url, limit: opts.limit ?? 20 }, opts)
  return parseList(raw, 'urls', UrlView)
}

/** `network.cosmik.connection.getForUrl`: connections anyone made to or from `url`. */
export async function fetchConnectionsForUrl(
  url: string,
  opts: Options & { limit?: number } = {},
): Promise<SembleConnectionView[]> {
  const raw = await get('network.cosmik.connection.getForUrl', { url, direction: 'both', limit: opts.limit ?? 30 }, opts)
  return parseList(raw, 'connections', ConnectionView)
}

const CollectionCard = z
  .object({
    url: z.string(),
    cardContent: UrlMetadata.optional(),
    author: User,
    urlLibraryCount: z.number().optional(),
    note: z.object({ text: z.string() }).passthrough().optional(),
  })
  .passthrough()

const CollectionPage = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    cardCount: z.number().optional(),
    followerCount: z.number().optional(),
    author: User.optional(),
  })
  .passthrough()

const Contributor = User.extend({ contributionCount: z.number().optional() })

export type SembleCollectionCard = z.infer<typeof CollectionCard>
export type SembleContributor = z.infer<typeof Contributor>
export type SembleCollectionPage = z.infer<typeof CollectionPage> & { cards: SembleCollectionCard[] }

/**
 * `network.cosmik.collection.getByAtUri`: Semble's view of a collection,
 * including cards other people added to an Open collection (which live in
 * their repos, not ours), its card and follower counts, and Semble's id.
 */
export async function fetchCollectionPage(handle: string, recordKey: string, opts: Options & { limit?: number } = {}): Promise<SembleCollectionPage> {
  const raw = await get('network.cosmik.collection.getByAtUri', { handle, recordKey, limit: opts.limit ?? 50 }, opts)
  const parsed = CollectionPage.safeParse(raw)
  if (!parsed.success) throw new SembleApiError('Semble returned an unexpected response.')
  return { ...parsed.data, cards: parseList(raw, 'urlCards', CollectionCard) }
}

/** `network.cosmik.collection.getContributors`: people who added cards, with how many. */
export async function fetchCollectionContributors(collectionId: string, opts: Options & { limit?: number } = {}): Promise<SembleContributor[]> {
  const raw = await get('network.cosmik.collection.getContributors', { collectionId, limit: opts.limit ?? 50 }, opts)
  return parseList(raw, 'users', Contributor)
}
