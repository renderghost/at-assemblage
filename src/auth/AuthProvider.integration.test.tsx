import { OAuthUserAgent, listStoredSessions, type Session } from '@atcute/oauth-browser-client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearStoredOAuthSessions,
  createFetchHandler,
  hasStoredOAuthSession,
} from '../services/atproto/oauth'
import { hasPersistedSession, signIn } from '../services/atproto/session'
import { useUiStore } from '../state/uiStore'
import { FakePds } from '../test/fakePds'
import { oauthSessionFixture, stubOAuthRuntime } from '../test/oauth'
import { AuthProvider, resetResumeLatchForTests } from './AuthProvider'
import { useAuthContext } from './AuthContext'

/** Seed the installed SDK's v2 storage format without mocking its session API. */
function seedOAuthSession(session: Session): void {
  localStorage.setItem('atcute-oauth:version', '2')
  localStorage.setItem(`atcute-oauth:sessions:${session.info.sub}`, JSON.stringify({
    value: session,
    expiresAt: null,
    revision: Date.now(),
  }))
}

beforeEach(() => {
  stubOAuthRuntime()
  localStorage.clear()
  resetResumeLatchForTests()
})

afterEach(() => {
  cleanup()
  clearStoredOAuthSessions()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function Harness() {
  const { state, signIn, signOut } = useAuthContext()
  return <>
    <span data-testid="status">{state.status}</span>
    <span data-testid="method">{state.status === 'signed-in' ? state.auth.method : ''}</span>
    <button onClick={() => void signIn({
      identifier: 'alice.test', appPassword: 'abcd-efgh-ijkl-mnop', keepSignedIn: true,
    })}>App Password</button>
    <button onClick={() => void signOut()}>Sign out</button>
  </>
}

function renderProvider(pds: FakePds) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider options={{ fetch: pds.fetch }}><Harness /></AuthProvider>
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

describe('OAuth token rejection with the real SDK', () => {
  it.each(['invalid_grant', 'server_error'] as const)(
    'probes a cached, unexpired token after the user agent hides %s',
    async (error) => {
      const stored = await oauthSessionFixture()
      seedOAuthSession(stored)
      expect(hasStoredOAuthSession()).toBe(true)
      let tokenRequests = 0
      vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.endsWith('/oauth/token')) {
          tokenRequests += 1
          return Response.json({ error }, { status: error === 'invalid_grant' ? 400 : 503 })
        }
        if (url.includes('/xrpc/')) {
          return new Response('{}', { status: 401, headers: { 'www-authenticate': 'DPoP error="invalid_token"' } })
        }
        throw new TypeError('identity directory offline')
      }))
      const onEnded = vi.fn()
      const handler = createFetchHandler(new OAuthUserAgent(stored), stored.info.sub, stored.info.aud, onEnded)

      const response = await handler('/xrpc/test', {})

      expect(response.status).toBe(401)
      expect(tokenRequests).toBe(2)
      if (error === 'invalid_grant') {
        expect(onEnded).toHaveBeenCalledExactlyOnceWith()
        expect(listStoredSessions()).toEqual([])
      } else {
        expect(onEnded).not.toHaveBeenCalled()
        expect(listStoredSessions()).toEqual([stored.info.sub])
      }
    },
    10_000,
  )
})

describe('explicit sign-out across authentication stores', () => {
  it.each(['oauth', 'password'] as const)('cannot restore leftover credentials after signing out of %s', async (method) => {
    const pds = new FakePds()
    const stored = await oauthSessionFixture()
    if (method === 'password') stored.token.expires_at = 0
    seedOAuthSession(stored)
    // A second OAuth account must not become active after signing out of the first.
    if (method === 'oauth') {
      const other = await oauthSessionFixture('did:plc:otheraccount')
      seedOAuthSession(other)
    }
    await signIn({
      identifier: 'alice.test', appPassword: 'abcd-efgh-ijkl-mnop', keepSignedIn: true,
    }, { fetch: pds.fetch })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('/oauth/')) return Response.json({ error: 'server_error' }, { status: 503 })
      return pds.fetch(input, init)
    }))

    const view = renderProvider(pds)
    if (method === 'password') {
      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'))
      expect(listStoredSessions()).toEqual([stored.info.sub])
      await userEvent.click(screen.getByText('App Password'))
    }
    await waitFor(() => expect(screen.getByTestId('method')).toHaveTextContent(method))
    expect(hasPersistedSession()).toBe(true)
    view.queryClient.setQueryData(['private'], 'cached account data')
    act(() => useUiStore.getState().setSelectedGroupIds(['private-group']))

    await userEvent.click(screen.getByText('Sign out'))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'))
    expect(listStoredSessions()).toEqual([])
    expect(hasPersistedSession()).toBe(false)
    expect(view.queryClient.getQueryData(['private'])).toBeUndefined()
    expect(useUiStore.getState().selectedGroupIds).toEqual([])
    view.unmount()
    resetResumeLatchForTests()
    renderProvider(pds)
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out')
  })
})
