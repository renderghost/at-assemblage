import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  clearPersistedSession,
  hasPersistedSession,
  resumeSession,
  signIn as signInService,
  signOut as signOutService,
  type SessionOptions,
  type SignInInput,
  type SignedInSession,
} from '../services/atproto/session'
import {
  clearStoredOAuthSessions,
  describeOAuthError,
  finishOAuthSignIn,
  hasOAuthCallbackParams,
  hasStoredOAuthSession,
  readOAuthCallbackParams,
  resumeOAuthSession,
  signOutOAuthSession,
  startOAuthSignIn as startOAuthSignInService,
} from '../services/atproto/oauth'
import { useUiStore } from '../state/uiStore'
import { AuthContext, type AuthState } from './AuthContext'

// Resume at most once per page load. A refresh token is single-use, so a
// second concurrent resume (e.g. React StrictMode) would revoke the first.
let resumeOnce: Promise<SignedInSession | null> | null = null

/** Isolate tests without changing the per-page restore latch. */
export function resetResumeLatchForTests(): void {
  resumeOnce = null
}

function clearOAuthParams() {
  const url = new URL(globalThis.location.href)
  url.search = ''
  url.hash = ''
  globalThis.history.replaceState({}, '', url)
}

type Props = { children: ReactNode; options?: Omit<SessionOptions, 'onExpired'> }

export function AuthProvider({ children, options }: Props) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>(() => {
    let hasStoredOAuth: boolean
    try {
      hasStoredOAuth = hasStoredOAuthSession()
    } catch (err) {
      return { status: 'signed-out', notice: describeOAuthError(err) }
    }
    return hasOAuthCallbackParams() || hasStoredOAuth || hasPersistedSession(options?.store)
      ? { status: 'restoring' }
      : { status: 'signed-out' }
  })
  const signingOut = useRef(false)
  // Ignore expiry callbacks retained by an older session.
  const generation = useRef(0)
  const optionsRef = useRef(options)

  const clearAppState = useCallback(() => {
    queryClient.clear()
    useUiStore.getState().reset()
  }, [queryClient])

  // A later migration lookup may refine the initial expiry notice.
  const makeOnExpired = useCallback(() => {
    const issuedFor = generation.current
    return (notice?: string) => {
      if (signingOut.current || issuedFor !== generation.current) return
      clearAppState()
      setState((prev) => {
        // A generic expiry must not overwrite a specific explanation.
        if (prev.status === 'signed-out') {
          return notice ? { status: 'signed-out', notice } : prev
        }
        return {
          status: 'signed-out',
          notice: notice ?? 'Your session ended. Please sign in again.',
        }
      })
    }
  }, [clearAppState])

  useEffect(() => {
    if (state.status !== 'restoring') return
    if (!resumeOnce) {
      generation.current += 1
      resumeOnce = restoreSession(optionsRef.current, makeOnExpired())
    }
    let cancelled = false
    resumeOnce.then(
      (auth) => {
        if (cancelled) return
        setState(auth ? { status: 'signed-in', auth } : { status: 'signed-out' })
      },
      (err: unknown) => {
        if (cancelled) return
        setState({ status: 'signed-out', notice: describeOAuthError(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [state.status, makeOnExpired])

  const signIn = useCallback(
    async (input: SignInInput) => {
      signingOut.current = false
      generation.current += 1
      const auth = await signInService(input, { ...optionsRef.current, onExpired: makeOnExpired() })
      clearAppState()
      setState({ status: 'signed-in', auth })
    },
    [makeOnExpired, clearAppState],
  )

  const startOAuthSignIn = useCallback(async (identifier: string) => {
    signingOut.current = false
    await startOAuthSignInService(identifier)
  }, [])

  const signOut = useCallback(async () => {
    if (state.status !== 'signed-in') return
    signingOut.current = true
    try {
      if (state.auth.method === 'oauth') {
        await signOutOAuthSession(state.auth)
      } else {
        await signOutService(state.auth, { store: optionsRef.current?.store })
      }
    } catch {
      // The server session may outlive this, but local credentials are gone.
    } finally {
      clearPersistedSession(optionsRef.current?.store)
      clearStoredOAuthSessions()
      generation.current += 1
      resumeOnce = null
      clearAppState()
      setState({ status: 'signed-out' })
    }
  }, [state, clearAppState])

  const value = useMemo(
    () => ({ state, signIn, startOAuthSignIn, signOut }),
    [state, signIn, startOAuthSignIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

async function restoreSession(
  options: Omit<SessionOptions, 'onExpired'> | undefined,
  onExpired: (notice?: string) => void,
): Promise<SignedInSession | null> {
  if (hasOAuthCallbackParams()) {
    const params = readOAuthCallbackParams()
    clearOAuthParams()
    try {
      return await finishOAuthSignIn(params, onExpired)
    } catch (err) {
      const existing = await resumeOAuthSession(onExpired).catch(() => null)
      if (existing) return existing
      throw err
    }
  }
  const oauth = await resumeOAuthSession(onExpired)
  if (oauth) return oauth
  return resumeSession({ ...options, onExpired })
}
