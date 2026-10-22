import { Client } from '@atproto/lex-client'
import { PasswordSession, type SessionData } from '@atproto/lex-password-session'
import { resolveIdentity, type Did } from './identity'

/** Bluesky-style App Passwords: four groups of four lowercase letters/digits. */
const APP_PASSWORD_RE = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/

export function isAppPasswordFormat(value: string): boolean {
  return APP_PASSWORD_RE.test(value.trim().toLowerCase())
}

export type AuthSession = {
  /** How the session was established. See {@link SignedInSession}. */
  method: 'password'
  did: Did
  handle: string
  pds: string
  client: Client
  session: PasswordSession
}

export type SignedInSession = AuthSession | import('./oauth').OAuthSession

export type SessionEvents = {
  /** Called when the session ends without the user signing out (e.g. revoked refresh token). */
  onExpired?: (notice?: string) => void
}

/** Narrow storage contract so tests can substitute an in-memory store. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const STORAGE_KEY = 'assemblage:session:v1'

/**
 * What we persist when "Keep me signed in" is on: the refresh token and the
 * minimum needed to resume. The access token is deliberately not stored;
 * `PasswordSession.resume` refreshes immediately.
 */
type PersistedSession = Pick<SessionData, 'did' | 'handle' | 'refreshJwt' | 'service'>

function safeStore(store?: KeyValueStore): KeyValueStore | null {
  if (store) return store
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function persist(store: KeyValueStore | null, data: SessionData) {
  if (!store) return
  const value: PersistedSession = {
    did: data.did,
    handle: data.handle,
    refreshJwt: data.refreshJwt,
    service: data.service,
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the session still works for this tab.
  }
}

export function clearPersistedSession(store?: KeyValueStore) {
  try {
    safeStore(store)?.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function hasPersistedSession(store?: KeyValueStore): boolean {
  try {
    return !!safeStore(store)?.getItem(STORAGE_KEY)
  } catch {
    return false
  }
}

function toAuthSession(session: PasswordSession, pds: string, fallbackHandle: string): AuthSession {
  return {
    method: 'password',
    did: session.did as Did,
    handle: session.handle ?? fallbackHandle,
    pds,
    session,
    client: new Client(session),
  }
}

export type SignInInput = {
  identifier: string
  appPassword: string
  authFactorToken?: string
  keepSignedIn: boolean
}

export type SessionOptions = SessionEvents & {
  fetch?: typeof globalThis.fetch
  store?: KeyValueStore
}

/**
 * Resolves the account's PDS and calls `com.atproto.server.createSession`
 * there. Throws `LexAuthFactorError` when an emailed code is required.
 */
export async function signIn(input: SignInInput, opts: SessionOptions = {}): Promise<AuthSession> {
  const identity = await resolveIdentity(input.identifier, { fetch: opts.fetch })
  const store = input.keepSignedIn ? safeStore(opts.store) : null
  if (!input.keepSignedIn) clearPersistedSession(opts.store)

  const session = await PasswordSession.login({
    service: identity.pds,
    // Log in by DID so a handle change mid-flow cannot redirect the login.
    identifier: identity.did,
    password: input.appPassword.trim(),
    authFactorToken: input.authFactorToken?.trim() || undefined,
    fetch: opts.fetch,
    onUpdated: (data) => persist(store, data),
    onDeleted: () => {
      clearPersistedSession(opts.store)
      opts.onExpired?.()
    },
  })
  return toAuthSession(session, identity.pds, identity.handle ?? input.identifier)
}

/** Restores a "Keep me signed in" session. Returns null if there is none or it is no longer valid. */
export async function resumeSession(opts: SessionOptions = {}): Promise<AuthSession | null> {
  const store = safeStore(opts.store)
  let saved: PersistedSession | null
  try {
    const raw = store?.getItem(STORAGE_KEY)
    saved = raw ? (JSON.parse(raw) as PersistedSession) : null
  } catch {
    saved = null
  }
  if (!saved?.refreshJwt || !saved.did || !saved.service) {
    clearPersistedSession(opts.store)
    return null
  }
  try {
    const session = await PasswordSession.resume(
      { ...saved, accessJwt: '' } as SessionData,
      {
        fetch: opts.fetch,
        onUpdated: (data) => persist(store, data),
        onDeleted: () => {
          clearPersistedSession(opts.store)
          opts.onExpired?.()
        },
      },
    )
    return toAuthSession(session, saved.service, saved.handle)
  } catch {
    clearPersistedSession(opts.store)
    return null
  }
}

/** Calls `com.atproto.server.deleteSession` and clears local credentials regardless of outcome. */
export async function signOut(auth: AuthSession, opts: Pick<SessionOptions, 'store'> = {}): Promise<void> {
  try {
    await auth.session.logout()
  } finally {
    clearPersistedSession(opts.store)
  }
}
