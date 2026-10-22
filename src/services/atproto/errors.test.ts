import { AuthorizationError, FetchResponseError, TokenRefreshError } from '@atcute/oauth-browser-client'
import { describe, expect, it } from 'vitest'
import { describeError } from './errors'

describe('describeError for OAuth failures', () => {
  it('does not call a non-JSON token response an ended session', () => {
    const err = new FetchResponseError(new Response('nope', { status: 200 }), 2, 'unexpected content-type')
    expect(describeError(err)).toMatchObject({ kind: 'network', retryable: true })
  })

  it('treats a revoked refresh token as an ended session', () => {
    expect(describeError(new TokenRefreshError('did:plc:abc', 'session was revoked'))).toMatchObject({
      kind: 'session-expired',
      retryable: false,
    })
  })

  it('calls a cancelled sign-in a cancellation, not a failure', () => {
    expect(describeError(new AuthorizationError('access_denied', 'the user said no'))).toMatchObject({
      kind: 'permission',
      message: 'Sign-in was cancelled.',
    })
  })
})
