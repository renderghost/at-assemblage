import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FetchResponseError, OAuthResponseError, TokenRefreshError } from '@atcute/oauth-browser-client'
import { oauthSessionFixture, stubOAuthRuntime } from '../../test/oauth'
import { SessionEndedError } from './errors'
import {
  createFetchHandler,
  describeOAuthError,
  hasOAuthCallbackParams,
  hasStoredOAuthSession,
  readOAuthCallbackParams,
  resumeOAuthSession,
} from './oauth'

const rpc = vi.hoisted(() => ({
  getSession: vi.fn<typeof import('@atcute/oauth-browser-client').getSession>(),
  deleteStoredSession: vi.fn<typeof import('@atcute/oauth-browser-client').deleteStoredSession>(),
  listStoredSessions: vi.fn<typeof import('@atcute/oauth-browser-client').listStoredSessions>(),
  resolveDidDocument: vi.fn<typeof import('./identity').resolveDidDocument>(),
}))

vi.mock('@atcute/oauth-browser-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@atcute/oauth-browser-client')>()
  return {
    ...actual,
    getSession: rpc.getSession,
    deleteStoredSession: rpc.deleteStoredSession,
    listStoredSessions: rpc.listStoredSessions,
  }
})

vi.mock('./identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./identity')>()
  return { ...actual, resolveDidDocument: rpc.resolveDidDocument }
})

const DID = 'did:plc:testuser1234567890abcdef'
const PDS = 'https://pds.example.com'

beforeEach(() => {
  vi.resetAllMocks()
  stubOAuthRuntime()
  rpc.listStoredSessions.mockReturnValue([DID])
  rpc.resolveDidDocument.mockRejectedValue(new Error('offline'))
})

afterEach(() => vi.unstubAllGlobals())

function at(url: string) {
  vi.stubGlobal('location', new URL(url, globalThis.location.origin))
}

describe('readOAuthCallbackParams', () => {
  it('reads the authorization response out of the fragment', () => {
    at('/#state=6e8BEK7JT0k7OEnsJbRVRYLH&iss=https%3A%2F%2Faster.id&code=cod-36aadc8e')
    expect(readOAuthCallbackParams().get('code')).toBe('cod-36aadc8e')
    expect(readOAuthCallbackParams().get('iss')).toBe('https://aster.id')
    expect(hasOAuthCallbackParams()).toBe(true)
  })

  it('falls back to the query string when the server ignores the requested mode', () => {
    at('/?state=abc&iss=https%3A%2F%2Fbsky.social&code=cod-query')
    expect(readOAuthCallbackParams().get('code')).toBe('cod-query')
    expect(hasOAuthCallbackParams()).toBe(true)
  })

  it('finds an error response in the fragment too', () => {
    at('/#state=abc&error=access_denied')
    expect(hasOAuthCallbackParams()).toBe(true)
    expect(readOAuthCallbackParams().get('error')).toBe('access_denied')
  })

  it('reports no callback on an ordinary visit', () => {
    at('/')
    expect(hasOAuthCallbackParams()).toBe(false)
  })

  it('ignores a fragment that carries no authorization response', () => {
    at('/#/some/app/route')
    expect(hasOAuthCallbackParams()).toBe(false)
  })
})

describe('hasStoredOAuthSession', () => {
  it('reports a misconfigured origin instead of claiming there is no session', () => {
    // Redirecting from localhost to 127.0.0.1 would lose the origin-bound OAuth state.
    at('http://localhost:5173/')
    expect(() => hasStoredOAuthSession()).toThrow(/127\.0\.0\.1/)
  })
})

describe('createFetchHandler', () => {
  const respond = (status: number, wwwAuthenticate?: string) =>
    new Response('{}', { status, headers: wwwAuthenticate ? { 'www-authenticate': wwwAuthenticate } : {} })

  async function harness(response: Response) {
    const notices: (string | undefined)[] = []
    const handler = createFetchHandler({ handle: async () => response }, DID, PDS, (n) => notices.push(n))
    const result = await handler('/xrpc/test', {})
    return { result, notices }
  }

  it.each(['DPoP', 'Bearer'])('preserves the session when a rejected %s token can still refresh', async (scheme) => {
    rpc.getSession.mockResolvedValue(await oauthSessionFixture())

    const { notices } = await harness(respond(401, `${scheme} error="invalid_token"`))

    expect(notices).toEqual([])
    expect(rpc.deleteStoredSession).not.toHaveBeenCalled()
    expect(rpc.getSession).toHaveBeenCalledExactlyOnceWith(DID, { noCache: true })
  })

  it('refines the expiry notice when a rejected grant belongs to a migrated account', async () => {
    rpc.getSession.mockRejectedValue(new TokenRefreshError(DID, 'revoked'))
    rpc.resolveDidDocument.mockResolvedValue({ service: [{
      id: '#atproto_pds', serviceEndpoint: 'https://new-pds.example.com',
    }] })

    const { notices } = await harness(respond(401, 'DPoP error="invalid_token"'))

    expect(notices).toEqual([
      undefined,
      'Your account has moved to new-pds.example.com. Sign in again to reconnect.',
    ])
    expect(rpc.deleteStoredSession).toHaveBeenCalledWith(DID)
  })

  it('does not probe or delete sessions for responses that are not token rejections', async () => {
    for (const response of [
      respond(200), respond(401), respond(401, 'Bearer realm="atproto"'),
      respond(429), respond(500, 'DPoP error="invalid_token"'),
    ]) {
      const { notices, result } = await harness(response)
      expect(result).toBe(response)
      expect(notices).toEqual([])
    }
    expect(rpc.getSession).not.toHaveBeenCalled()
    expect(rpc.deleteStoredSession).not.toHaveBeenCalled()
  })
})

describe('resumeOAuthSession', () => {
  it('reads the issuing PDS without refreshing, then restores a usable session', async () => {
    const stored = await oauthSessionFixture()
    rpc.getSession.mockResolvedValue(stored)
    rpc.resolveDidDocument.mockResolvedValue({ alsoKnownAs: ['at://alice.test'] })

    const auth = await resumeOAuthSession()

    expect(auth).toMatchObject({ method: 'oauth', did: DID, handle: 'alice.test', pds: stored.info.aud })
    expect(rpc.getSession.mock.calls).toEqual([[DID, { allowStale: true }], [DID]])
    expect(rpc.deleteStoredSession).not.toHaveBeenCalled()
  })

  it('ends the session when refreshing the stored grant fails permanently', async () => {
    rpc.getSession.mockResolvedValueOnce(await oauthSessionFixture())
      .mockRejectedValueOnce(new TokenRefreshError(DID, 'session was revoked'))

    await expect(resumeOAuthSession()).rejects.toBeInstanceOf(SessionEndedError)
    expect(rpc.deleteStoredSession).toHaveBeenCalledWith(DID)
  })

  it.each([
    new TypeError('Failed to fetch'),
    new FetchResponseError(new Response('nope', { status: 200 }), 2, 'unexpected content-type'),
    new OAuthResponseError(new Response('', { status: 503 }), { error: 'server_error' }),
  ])('preserves the stored grant after a transient refresh failure: %s', async (error) => {
    rpc.getSession.mockResolvedValueOnce(await oauthSessionFixture()).mockRejectedValueOnce(error)

    await expect(resumeOAuthSession()).rejects.toBe(error)
    expect(rpc.deleteStoredSession).not.toHaveBeenCalled()
  })

  it('recognises invalid_grant even when atcute does not wrap it', async () => {
    rpc.getSession.mockResolvedValueOnce(await oauthSessionFixture())
      .mockRejectedValueOnce(new OAuthResponseError(new Response('', { status: 503 }), { error: 'invalid_grant' }))

    await expect(resumeOAuthSession()).rejects.toBeInstanceOf(SessionEndedError)
    expect(rpc.deleteStoredSession).toHaveBeenCalledWith(DID)
  })

  it('reports a migration using the PDS saved before the failed refresh', async () => {
    rpc.getSession.mockResolvedValueOnce(await oauthSessionFixture())
      .mockRejectedValueOnce(new TokenRefreshError(DID, 'session was revoked'))
    rpc.resolveDidDocument.mockResolvedValue({ service: [{
      id: '#atproto_pds', serviceEndpoint: 'https://new-pds.example.com',
    }] })

    const error = await resumeOAuthSession().catch((err: unknown) => err)

    expect(describeOAuthError(error)).toBe(
      'Your account has moved to new-pds.example.com. Sign in again to reconnect.',
    )
    expect(rpc.deleteStoredSession).toHaveBeenCalledWith(DID)
  })

  it('returns null without consulting the token store when nothing is saved', async () => {
    rpc.listStoredSessions.mockReturnValue([])
    await expect(resumeOAuthSession()).resolves.toBeNull()
    expect(rpc.getSession).not.toHaveBeenCalled()
  })
})
