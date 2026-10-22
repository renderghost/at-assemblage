import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Client } from '@atproto/lex-client'
import { PasswordSession } from '@atproto/lex-password-session'
import { configureOAuth, OAuthUserAgent } from '@atcute/oauth-browser-client'
import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, resetResumeLatchForTests } from './AuthProvider'
import { useAuthContext } from './AuthContext'
import type { AuthSession } from '../services/atproto/session'
import type { OAuthSession } from '../services/atproto/oauth'
import { oauthSessionFixture, stubOAuthRuntime } from '../test/oauth'

const svc = vi.hoisted(() => ({
  clearPersistedSession: vi.fn<typeof import('../services/atproto/session').clearPersistedSession>(),
  clearStoredOAuthSessions: vi.fn<typeof import('../services/atproto/oauth').clearStoredOAuthSessions>(),
  hasPersistedSession: vi.fn<typeof import('../services/atproto/session').hasPersistedSession>(),
  resumeSession: vi.fn<typeof import('../services/atproto/session').resumeSession>(),
  signIn: vi.fn<typeof import('../services/atproto/session').signIn>(),
  signOut: vi.fn<typeof import('../services/atproto/session').signOut>(),
  describeOAuthError: vi.fn((err: unknown) => `described: ${String(err)}`),
  finishOAuthSignIn: vi.fn<typeof import('../services/atproto/oauth').finishOAuthSignIn>(),
  hasOAuthCallbackParams: vi.fn(() => false),
  hasStoredOAuthSession: vi.fn(() => false),
  readOAuthCallbackParams: vi.fn(() => new URLSearchParams()),
  resumeOAuthSession: vi.fn<typeof import('../services/atproto/oauth').resumeOAuthSession>(),
  signOutOAuthSession: vi.fn<typeof import('../services/atproto/oauth').signOutOAuthSession>(),
  startOAuthSignIn: vi.fn<typeof import('../services/atproto/oauth').startOAuthSignIn>(),
}))

vi.mock('../services/atproto/session', () => ({
  clearPersistedSession: svc.clearPersistedSession,
  hasPersistedSession: svc.hasPersistedSession,
  resumeSession: svc.resumeSession,
  signIn: svc.signIn,
  signOut: svc.signOut,
}))
vi.mock('../services/atproto/oauth', () => ({
  clearStoredOAuthSessions: svc.clearStoredOAuthSessions,
  describeOAuthError: svc.describeOAuthError,
  finishOAuthSignIn: svc.finishOAuthSignIn,
  hasOAuthCallbackParams: svc.hasOAuthCallbackParams,
  hasStoredOAuthSession: svc.hasStoredOAuthSession,
  readOAuthCallbackParams: svc.readOAuthCallbackParams,
  resumeOAuthSession: svc.resumeOAuthSession,
  signOutOAuthSession: svc.signOutOAuthSession,
  startOAuthSignIn: svc.startOAuthSignIn,
}))

let oauthSession: OAuthSession
const passwordSession: AuthSession = {
  method: 'password', did: 'did:plc:test', handle: 'alice.test', pds: 'https://pds.example.com',
  client: new Client({ service: 'https://pds.example.com' }),
  session: new PasswordSession({
    did: 'did:plc:test', handle: 'alice.test', service: 'https://pds.example.com',
    accessJwt: 'access', refreshJwt: 'refresh',
  }),
}

/** Renders the provider and exposes the live context value for assertions. */
function Harness() {
  const ctx = useAuthContext()
  return (
    <div>
      <span data-testid="status">{ctx.state.status}</span>
      <span data-testid="notice">{ctx.state.status === 'signed-out' ? (ctx.state.notice ?? '') : ''}</span>
      <span data-testid="method">
        {ctx.state.status === 'signed-in' ? ctx.state.auth.method : ''}
      </span>
      <button onClick={() => void ctx.signIn({ identifier: 'a', appPassword: 'b', keepSignedIn: false })}>
        do-sign-in
      </button>
      <button onClick={() => void ctx.signOut()}>do-sign-out</button>
    </div>
  )
}

function renderProvider(strict = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const ui = (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui)
}

const replaceState = vi.spyOn(globalThis.history, 'replaceState').mockImplementation(() => {})

const status = () => screen.getByTestId('status').textContent
const notice = () => screen.getByTestId('notice').textContent

beforeEach(async () => {
  vi.resetAllMocks()
  stubOAuthRuntime()
  configureOAuth({
    metadata: { client_id: 'http://localhost', redirect_uri: 'http://127.0.0.1:5173/' },
    identityResolver: { resolve: async () => { throw new Error('unexpected identity resolution') } },
  })
  resetResumeLatchForTests()
  svc.describeOAuthError.mockImplementation((err) => `described: ${String(err)}`)
  svc.readOAuthCallbackParams.mockReturnValue(new URLSearchParams())
  svc.hasPersistedSession.mockReturnValue(false)
  svc.hasOAuthCallbackParams.mockReturnValue(false)
  svc.hasStoredOAuthSession.mockReturnValue(false)
  svc.resumeOAuthSession.mockResolvedValue(null)
  svc.resumeSession.mockResolvedValue(null)
  svc.startOAuthSignIn.mockResolvedValue(undefined)
  const stored = await oauthSessionFixture()
  oauthSession = {
    method: 'oauth', did: stored.info.sub, handle: 'alice.test', pds: stored.info.aud,
    client: new Client({ service: stored.info.aud }), userAgent: new OAuthUserAgent(stored),
  }
  // happy-dom's document origin differs from the stubbed location.
  replaceState.mockImplementation(() => {})
})

afterEach(() => vi.unstubAllGlobals())

describe('AuthProvider — initial state', () => {
  it('prefers OAuth resume over the App Password store', async () => {
    svc.hasStoredOAuthSession.mockReturnValue(true)
    svc.hasPersistedSession.mockReturnValue(true)
    svc.resumeOAuthSession.mockResolvedValue(oauthSession)

    renderProvider()
    expect(status()).toBe('restoring')

    await waitFor(() => expect(status()).toBe('signed-in'))
    expect(screen.getByTestId('method').textContent).toBe('oauth')
    expect(svc.resumeSession).not.toHaveBeenCalled()
  })

  it('falls back to the App Password store when there is no OAuth session', async () => {
    svc.hasPersistedSession.mockReturnValue(true)
    svc.resumeSession.mockResolvedValue(passwordSession)

    renderProvider()
    await waitFor(() => expect(status()).toBe('signed-in'))
    expect(screen.getByTestId('method').textContent).toBe('password')
  })

  it('restores only once under StrictMode and retains the expiry callback', async () => {
    svc.hasStoredOAuthSession.mockReturnValue(true)
    svc.resumeOAuthSession.mockResolvedValue(oauthSession)
    renderProvider(true)
    await waitFor(() => expect(status()).toBe('signed-in'))
    expect(svc.resumeOAuthSession).toHaveBeenCalledTimes(1)
    act(() => svc.resumeOAuthSession.mock.calls[0][0]!())
    expect(status()).toBe('signed-out')
    expect(notice()).toBe('Your session ended. Please sign in again.')
  })

  it('finishes a successful callback and removes its single-use parameters', async () => {
    const params = new URLSearchParams('code=one-use&state=test')
    vi.stubGlobal('location', new URL('http://127.0.0.1:5173/?code=one-use&state=test#code=one-use'))
    svc.hasOAuthCallbackParams.mockReturnValue(true)
    svc.readOAuthCallbackParams.mockReturnValue(params)
    svc.finishOAuthSignIn.mockResolvedValue(oauthSession)
    renderProvider()
    await waitFor(() => expect(status()).toBe('signed-in'))
    expect(svc.finishOAuthSignIn).toHaveBeenCalledWith(params, expect.any(Function))
    expect(svc.resumeOAuthSession).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(String(replaceState.mock.calls[0][2])).toBe('http://127.0.0.1:5173/')
  })

  it('explains a misconfigured origin instead of offering a bare sign-in form', () => {
    svc.hasStoredOAuthSession.mockImplementation(() => {
      throw new Error('OAuth needs the app served on 127.0.0.1')
    })
    renderProvider()
    expect(status()).toBe('signed-out')
    expect(notice()).toContain('127.0.0.1')
  })
})

describe('AuthProvider — resume failures', () => {
  it('shows the reason when a transient failure leaves the grant intact', async () => {
    svc.hasStoredOAuthSession.mockReturnValue(true)
    svc.resumeOAuthSession.mockRejectedValue(new Error('server had a problem'))

    renderProvider()
    await waitFor(() => expect(status()).toBe('signed-out'))
    expect(notice()).toBe('described: Error: server had a problem')
  })

  it('resumes the existing session when the callback cannot be finished', async () => {
    svc.hasOAuthCallbackParams.mockReturnValue(true)
    svc.finishOAuthSignIn.mockRejectedValue(new Error('bad state'))
    svc.resumeOAuthSession.mockResolvedValue(oauthSession)

    renderProvider()
    await waitFor(() => expect(status()).toBe('signed-in'))
    expect(screen.getByTestId('method').textContent).toBe('oauth')
    // The authorization response must not stay in the URL: it is single-use.
    expect(replaceState).toHaveBeenCalled()
  })

  it('reports the callback error when there is no session to fall back to', async () => {
    svc.hasOAuthCallbackParams.mockReturnValue(true)
    svc.finishOAuthSignIn.mockRejectedValue(new Error('Access denied'))
    svc.resumeOAuthSession.mockResolvedValue(null)

    renderProvider()
    await waitFor(() => expect(status()).toBe('signed-out'))
    expect(notice()).toBe('described: Error: Access denied')
  })
})

describe('AuthProvider — late session expiry', () => {
  async function expiredAfterSignIn() {
    svc.signIn.mockResolvedValue(passwordSession)
    renderProvider()
    await userEvent.click(screen.getByText('do-sign-in'))
    await waitFor(() => expect(status()).toBe('signed-in'))
    return svc.signIn.mock.calls.at(-1)![1]!.onExpired!
  }

  it('refines a generic expiry notice without letting a later generic call overwrite it', async () => {
    const onExpired = await expiredAfterSignIn()

    act(() => onExpired())
    await waitFor(() => expect(status()).toBe('signed-out'))
    expect(notice()).toBe('Your session ended. Please sign in again.')

    act(() => onExpired('Your account moved to another server.'))
    expect(notice()).toBe('Your account moved to another server.')
    act(() => onExpired())
    expect(notice()).toBe('Your account moved to another server.')
  })

  it('does not let a stale expiry clobber a session that has since signed in', async () => {
    svc.signIn.mockResolvedValueOnce(passwordSession)
    renderProvider()
    await userEvent.click(screen.getByText('do-sign-in'))
    await waitFor(() => expect(status()).toBe('signed-in'))
    const staleOnExpired = svc.signIn.mock.calls.at(-1)![1]!.onExpired!

    // Sign out and back in; the second session is fresh.
    await userEvent.click(screen.getByText('do-sign-out'))
    await waitFor(() => expect(status()).toBe('signed-out'))
    svc.signIn.mockResolvedValueOnce(passwordSession)
    await userEvent.click(screen.getByText('do-sign-in'))
    await waitFor(() => expect(status()).toBe('signed-in'))

    act(() => staleOnExpired('Your session ended. Please sign in again.'))
    expect(status()).toBe('signed-in')
  })

  it('ignores an expiry that lands after the user signed out on purpose', async () => {
    svc.hasStoredOAuthSession.mockReturnValue(true)
    svc.resumeOAuthSession.mockResolvedValue(oauthSession)
    svc.signOutOAuthSession.mockResolvedValue(undefined)

    renderProvider()
    await waitFor(() => expect(status()).toBe('signed-in'))
    const onExpired = svc.resumeOAuthSession.mock.calls.at(-1)![0]!

    await userEvent.click(screen.getByText('do-sign-out'))
    await waitFor(() => expect(status()).toBe('signed-out'))
    act(() => onExpired('Your account moved to another server.'))
    expect(status()).toBe('signed-out')
    expect(notice()).toBe('')
  })
})

describe('AuthProvider — sign in and out', () => {
  it('still signs out locally when the server rejects the sign-out', async () => {
    svc.hasStoredOAuthSession.mockReturnValue(true)
    svc.resumeOAuthSession.mockResolvedValue(oauthSession)
    svc.signOutOAuthSession.mockRejectedValue(new Error('network down'))

    renderProvider()
    await waitFor(() => expect(status()).toBe('signed-in'))
    await userEvent.click(screen.getByText('do-sign-out'))

    await waitFor(() => expect(status()).toBe('signed-out'))
    expect(notice()).toBe('')
  })
})
