import { Client } from '@atproto/lex-client'
import type { FetchHandler } from '@atproto/lex-rpc'
import type { ActorIdentifier } from '@atcute/lexicons'
import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  DohJsonHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  XrpcHandleResolver,
} from '@atcute/identity-resolver'
import {
  OAuthUserAgent,
  configureOAuth,
  createAuthorizationUrl,
  deleteStoredSession,
  finalizeAuthorization,
  getSession,
  listStoredSessions,
  OAuthResponseError,
  TokenRefreshError,
} from '@atcute/oauth-browser-client'
import { config } from '../../config'
import { AppError, SessionEndedError, describeError } from './errors'
import {
  IdentityError,
  checkIdentifier,
  handleFromDidDocument,
  pdsFromDidDocument,
  resolveDidDocument,
  type Did,
} from './identity'

export const OAUTH_SCOPE = [
  'atproto',
  'repo:network.cosmik.collection',
  'repo:network.cosmik.card',
  'repo:network.cosmik.collectionLink',
  'repo:network.cosmik.connection',
  'repo:at.margin.note',
].join(' ')

function isLoopbackOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
}

function loopbackClient(origin: string): { client_id: string; redirect_uri: string } {
  const { port } = new URL(origin)
  const redirect_uri = `http://127.0.0.1${port ? `:${port}` : ''}/`
  return {
    client_id:
      `http://localhost?redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&scope=${encodeURIComponent(OAUTH_SCOPE)}`,
    redirect_uri,
  }
}

let configuredOrigin: string | null = null

function ensureConfigured(): void {
  const origin = globalThis.location?.origin ?? ''
  if (configuredOrigin === origin) return

  const host = new URL(origin).hostname
  if (isLoopbackOrigin(origin) && host === 'localhost') {
    throw new AppError(
      'unknown',
      'OAuth needs the app served on 127.0.0.1, not localhost. Reopen it at http://127.0.0.1:5173 instead.',
    )
  }

  const metadata = isLoopbackOrigin(origin)
    ? loopbackClient(origin)
    : { client_id: `${origin}/client-metadata.json`, redirect_uri: `${origin}/` }

  configureOAuth({
    metadata,
    identityResolver: new LocalActorResolver({
      handleResolver: new CompositeHandleResolver({
        strategy: 'race',
        methods: {
          dns: new DohJsonHandleResolver({ dohUrl: 'https://mozilla.cloudflare-dns.com/dns-query' }),
          http: new XrpcHandleResolver({ serviceUrl: config.handleResolver }),
        },
      }),
      didDocumentResolver: new CompositeDidDocumentResolver({
        methods: {
          plc: new PlcDidDocumentResolver({ apiUrl: config.plcDirectory }),
          web: new WebDidDocumentResolver(),
        },
      }),
    }),
  })
  configuredOrigin = origin
}

export type OAuthSession = {
  method: 'oauth'
  did: Did
  handle: string
  pds: string
  client: Client
  userAgent: OAuthUserAgent
}

/** Matches atcute's token-rejection check; a rejected access token alone does not prove revocation. */
export function isInvalidTokenResponse(response: Response): boolean {
  if (response.status !== 401) return false
  const auth = response.headers.get('www-authenticate')
  return (
    auth != null &&
    (auth.startsWith('Bearer ') || auth.startsWith('DPoP ')) &&
    auth.includes('error="invalid_token"')
  )
}

// atcute wraps invalid_grant only on HTTP 400. Other transport failures are not revocation.
function isDeadGrantError(err: unknown): boolean {
  if (err instanceof TokenRefreshError) return true
  return err instanceof OAuthResponseError && err.error === 'invalid_grant'
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return a.replace(/\/+$/, '') === b.replace(/\/+$/, '')
  }
}

async function explainSessionEnd(did: Did, sessionPds: string): Promise<string | undefined> {
  try {
    const currentPds = pdsFromDidDocument(await resolveDidDocument(did))
    if (currentPds && !sameOrigin(currentPds, sessionPds)) {
      return `Your account has moved to ${new URL(currentPds).host}. Sign in again to reconnect.`
    }
  } catch {
    // Offline or the directory is unreachable: a plain sign-out notice is enough.
  }
  return undefined
}

// The user agent hides refresh failures. Force a probe: cached tokens can be revoked before expiry.
async function isGrantDead(did: Did): Promise<boolean> {
  try {
    await getSession(did, { noCache: true })
    return false
  } catch (err) {
    return isDeadGrantError(err)
  }
}

export function createFetchHandler(
  userAgent: Pick<OAuthUserAgent, 'handle'>,
  did: Did,
  pds: string,
  onSessionEnded: (notice?: string) => void,
): FetchHandler {
  // Notify once immediately, then once more if a migration explains the failure.
  let ended = false
  let explained = false
  return async (path, init) => {
    const response = await userAgent.handle(path, init)
    if (!isInvalidTokenResponse(response)) return response

    if (!(await isGrantDead(did))) return response

    deleteStoredSession(did)
    if (!ended) {
      ended = true
      onSessionEnded()
    }
    const notice = await explainSessionEnd(did, pds)
    if (notice && !explained) {
      explained = true
      onSessionEnded(notice)
    }
    return response
  }
}

async function toOAuthSession(
  userAgent: OAuthUserAgent,
  onSessionEnded: (notice?: string) => void = () => {},
): Promise<OAuthSession> {
  const did = userAgent.sub as Did
  let handle: string = did
  try {
    handle = handleFromDidDocument(await resolveDidDocument(did)) ?? did
  } catch {
    // Failed DID document fetch must not block sign-in
  }
  const pds = userAgent.session.info.aud
  const fetchHandler = createFetchHandler(userAgent, did, pds, onSessionEnded)
  return {
    method: 'oauth',
    did,
    handle,
    pds,
    client: new Client({ did, fetchHandler }),
    userAgent,
  }
}

export async function startOAuthSignIn(identifier: string): Promise<void> {
  ensureConfigured()
  const check = checkIdentifier(identifier)
  if (!check.ok) throw new IdentityError('InvalidIdentifier', check.message)

  const actor = check.value as ActorIdentifier
  const url = await createAuthorizationUrl({
    target: { type: 'account', identifier: actor },
    scope: OAUTH_SCOPE,
  })
  globalThis.location.assign(url.toString())
  // Keep the caller busy until navigation replaces the document.
  return new Promise<never>(() => {})
}

export function readOAuthCallbackParams(): URLSearchParams {
  const { hash, search } = globalThis.location
  const fromHash = new URLSearchParams(hash.replace(/^#/, ''))
  if (fromHash.has('code') || fromHash.has('error')) return fromHash
  return new URLSearchParams(search)
}

export function hasOAuthCallbackParams(): boolean {
  const params = readOAuthCallbackParams()
  return params.has('code') || params.has('error')
}

/** Configuration errors surface on sign-in; unavailable storage means there is nothing to resume. */
export function hasStoredOAuthSession(): boolean {
  try {
    ensureConfigured()
    return listStoredSessions().length > 0
  } catch (err) {
    if (err instanceof AppError) throw err
    return false
  }
}

export async function finishOAuthSignIn(
  params: URLSearchParams,
  onSessionEnded?: (notice?: string) => void,
): Promise<OAuthSession> {
  ensureConfigured()
  const { session } = await finalizeAuthorization(params)
  return toOAuthSession(new OAuthUserAgent(session), onSessionEnded)
}

export async function resumeOAuthSession(
  onSessionEnded?: (notice?: string) => void,
): Promise<OAuthSession | null> {
  ensureConfigured()
  const stored = listStoredSessions()
  if (stored.length === 0) return null
  const did = stored[stored.length - 1]
  let sessionPds: string | null = null
  try {
    // Save the issuing PDS before refreshing so a revoked session can be checked for migration.
    sessionPds = (await getSession(did, { allowStale: true })).info.aud
    return await toOAuthSession(new OAuthUserAgent(await getSession(did)), onSessionEnded)
  } catch (err) {
    // Keep credentials on transient failures so a reload can retry.
    if (!isDeadGrantError(err)) throw err
    deleteStoredSession(did)
    const notice = sessionPds ? await explainSessionEnd(did, sessionPds) : undefined
    throw new SessionEndedError(notice)
  }
}

export async function signOutOAuthSession(session: OAuthSession): Promise<void> {
  try {
    await session.userAgent.signOut()
  } finally {
    deleteStoredSession(session.did)
  }
}

export function clearStoredOAuthSessions(): void {
  // A rejected origin (e.g. localhost) never opened the OAuth store.
  if (configuredOrigin === null) return
  for (const did of listStoredSessions()) deleteStoredSession(did)
}

export function describeOAuthError(err: unknown): string {
  if (err instanceof SessionEndedError && err.notice) return err.notice
  return describeError(err).message
}
