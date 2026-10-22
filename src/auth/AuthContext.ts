import { createContext, useContext } from 'react'
import type { SignInInput, SignedInSession } from '../services/atproto/session'

export type AuthState =
  | { status: 'restoring' }
  | { status: 'signed-out'; notice?: string }
  | { status: 'signed-in'; auth: SignedInSession }

export type AuthContextValue = {
  state: AuthState
  signIn: (input: SignInInput) => Promise<void>
  startOAuthSignIn: (identifier: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>')
  return ctx
}

/** For components that only render when signed in. */
export function useAuth(): SignedInSession {
  const { state } = useAuthContext()
  if (state.status !== 'signed-in') throw new Error('useAuth requires a signed-in session')
  return state.auth
}
