import type { Session } from '@atcute/oauth-browser-client'
import { generateDpopKey } from '@atcute/oauth-crypto'
import { vi } from 'vitest'

export async function oauthSessionFixture(
  sub: Session['info']['sub'] = 'did:plc:testuser1234567890abcdef',
): Promise<Session> {
  return {
    dpopKey: await generateDpopKey(['ES256']),
    info: {
      sub,
      aud: 'https://pds.example.com',
      server: {
        issuer: 'https://pds.example.com',
        authorization_endpoint: 'https://pds.example.com/oauth/authorize',
        token_endpoint: 'https://pds.example.com/oauth/token',
        revocation_endpoint: 'https://pds.example.com/oauth/revoke',
      },
    },
    token: {
      scope: 'atproto',
      type: 'DPoP',
      access: 'oauth-access',
      refresh: 'oauth-refresh',
      expires_at: Date.now() + 15 * 60_000,
    },
  }
}

export function stubOAuthRuntime(): void {
  vi.stubGlobal('location', {
    origin: 'http://127.0.0.1:5173',
    href: 'http://127.0.0.1:5173/',
    search: '',
    hash: '',
  })
  // Single-document tests need neither cross-tab broadcasts nor background cleanup.
  vi.stubGlobal('BroadcastChannel', class extends EventTarget {
    postMessage() {}
    close() {}
  })
  vi.stubGlobal('navigator', {
    locks: {
      request: (name: string, options: LockOptions | LockGrantedCallback<unknown>, callback?: LockGrantedCallback<unknown>) =>
        typeof options === 'function'
          ? Promise.resolve(options({ name, mode: 'exclusive' }))
          : Promise.resolve(callback?.(null)),
    },
  })
}
