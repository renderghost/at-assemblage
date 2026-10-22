import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AuthContext } from '../auth/AuthContext'
import { signIn, type AuthSession } from '../services/atproto/session'
import { FakePds, MemoryStore } from './fakePds'

export async function signedInFakePds(pds = new FakePds()) {
  const auth = await signIn(
    { identifier: pds.account.handle, appPassword: pds.account.password, keepSignedIn: false },
    { fetch: pds.fetch, store: new MemoryStore() },
  )
  return { pds, auth }
}

export function makeWrapper(auth: AuthSession) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const value = {
    state: { status: 'signed-in' as const, auth },
    signIn: vi.fn(),
    startOAuthSignIn: vi.fn(),
    signOut: vi.fn(),
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    )
  }
  return { Wrapper, queryClient }
}
