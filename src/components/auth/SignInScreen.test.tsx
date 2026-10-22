import { LexAuthFactorError } from '@atproto/lex-password-session'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import { SignInScreen } from './SignInScreen'

function renderWith(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    state: { status: 'signed-out' },
    signIn: vi.fn(),
    startOAuthSignIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  }
  render(
    <AuthContext.Provider value={value}>
      <SignInScreen />
    </AuthContext.Provider>,
  )
  return value
}

/** The App Password fields live inside a collapsed section; open it first. */
async function openAppPassword() {
  await userEvent.click(screen.getByText('Use an App Password instead'))
}

describe('SignInScreen', () => {
  it('submits OAuth on Enter in the shared identifier, with separate forms', async () => {
    const { startOAuthSignIn, signIn } = renderWith()
    await openAppPassword()
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social{Enter}')
    expect(startOAuthSignIn).toHaveBeenCalledExactlyOnceWith('alice.bsky.social')
    expect(signIn).not.toHaveBeenCalled()
    expect(document.querySelector('form form')).toBeNull()
  })

  it('submits App Password on Enter using the shared identifier and persistence choice', async () => {
    const { signIn, startOAuthSignIn } = renderWith()
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social')
    await openAppPassword()
    await userEvent.click(screen.getByRole('checkbox', { name: /Keep me signed in/ }))
    await userEvent.type(screen.getByLabelText('App Password'), 'abcd-efgh-ijkl-mnop{Enter}')
    expect(signIn).toHaveBeenCalledExactlyOnceWith({
      identifier: 'alice.bsky.social',
      appPassword: 'abcd-efgh-ijkl-mnop',
      authFactorToken: undefined,
      keepSignedIn: true,
    })
    expect(startOAuthSignIn).not.toHaveBeenCalled()
  })

  it.each(['oauth', 'password'] as const)('blocks both submission paths while %s is pending', async (method) => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    const signIn = vi.fn(() => pending)
    const startOAuthSignIn = vi.fn(() => pending)
    renderWith({ signIn, startOAuthSignIn })
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social')
    await openAppPassword()
    await userEvent.type(screen.getByLabelText('App Password'), 'abcd-efgh-ijkl-mnop')
    const oauthButton = screen.getByRole('button', { name: 'Continue to sign in' })
    const passwordButton = screen.getByRole('button', { name: 'Sign in with App Password' })
    await userEvent.click(method === 'oauth' ? oauthButton : passwordButton)
    expect(oauthButton).toBeDisabled()
    expect(passwordButton).toBeDisabled()
    fireEvent.submit(oauthButton.closest('form')!)
    fireEvent.submit(passwordButton.closest('form')!)
    expect(startOAuthSignIn).toHaveBeenCalledTimes(method === 'oauth' ? 1 : 0)
    expect(signIn).toHaveBeenCalledTimes(method === 'password' ? 1 : 0)
    await act(async () => { finish(); await pending })
    expect(oauthButton).toBeEnabled()
    expect(passwordButton).toBeEnabled()
  })

  it('does not start OAuth with a malformed identifier', async () => {
    const startOAuthSignIn = vi.fn()
    renderWith({ startOAuthSignIn })
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'not a handle!')
    await userEvent.click(screen.getByRole('button', { name: 'Continue to sign in' }))
    expect(screen.getByLabelText('Handle or DID')).toHaveAttribute('aria-invalid', 'true')
    expect(startOAuthSignIn).not.toHaveBeenCalled()
  })

  it('refuses anything that is not an App Password, before any request', async () => {
    const signIn = vi.fn()
    renderWith({ signIn })
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social')
    await openAppPassword()
    await userEvent.type(screen.getByLabelText('App Password'), 'my-real-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with App Password' }))
    expect(await screen.findByText(/Do not use your main account password/)).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('asks for the emailed code when the PDS requires it, then retries with it', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValueOnce(new LexAuthFactorError({} as never))
      .mockResolvedValueOnce(undefined)
    renderWith({ signIn })
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social')
    await openAppPassword()
    await userEvent.type(screen.getByLabelText('App Password'), 'abcd-efgh-ijkl-mnop')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with App Password' }))

    const code = await screen.findByLabelText('Email sign-in code')
    await userEvent.type(code, 'ABCDE-12345')
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))
    expect(signIn).toHaveBeenLastCalledWith(expect.objectContaining({ authFactorToken: 'ABCDE-12345' }))
  })

  it('shows a clear error for wrong credentials', async () => {
    const { XrpcResponseError } = await import('@atproto/lex-client')
    const { com } = await import('../../lexicons')
    const response = new Response(JSON.stringify({ error: 'AuthenticationRequired' }), { status: 401 })
    const err = new XrpcResponseError(com.atproto.server.createSession.main, response, {
      encoding: 'application/json',
      body: { error: 'AuthenticationRequired' },
    } as never)
    renderWith({ signIn: vi.fn().mockRejectedValue(err) })
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social')
    await openAppPassword()
    await userEvent.type(screen.getByLabelText('App Password'), 'abcd-efgh-ijkl-mnop')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with App Password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Handle or App Password is incorrect.')
  })
})
