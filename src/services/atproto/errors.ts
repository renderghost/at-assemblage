import { XrpcFetchError, XrpcResponseError } from '@atproto/lex-client'
import { LexAuthFactorError } from '@atproto/lex-password-session'
import {
  AuthorizationError,
  FetchResponseError,
  LoginError,
  OAuthResponseError,
  ResolverError,
  TokenRefreshError,
} from '@atcute/oauth-browser-client'
import { IdentityError } from './identity'

export type ErrorKind =
  | 'credentials'
  | 'two-factor'
  | 'session-expired'
  | 'network'
  | 'rate-limited'
  | 'validation'
  | 'not-found'
  | 'permission'
  | 'duplicate'
  | 'identity'
  | 'unknown'

export type DescribedError = {
  kind: ErrorKind
  /** Safe, actionable text for the UI. Never contains tokens or raw payloads. */
  message: string
  retryable: boolean
}

/** Raised by our own pre-flight checks (e.g. duplicate connection). */
export class AppError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class SessionEndedError extends AppError {
  constructor(notice?: string) {
    super('session-expired', 'Your session has ended. Please sign in again.')
    this.name = 'SessionEndedError'
    this.notice = notice
  }

  readonly notice?: string
}

function isValidationError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'LexValidationError'
}

/**
 * Maps any thrown value to a user-facing description. This is the only place
 * that turns transport errors into UI text, so nothing sensitive leaks out.
 */
export function describeError(err: unknown): DescribedError {
  if (err instanceof AppError) return { kind: err.kind, message: err.message, retryable: false }
  if (err instanceof IdentityError) return { kind: 'identity', message: err.message, retryable: err.code === 'DidNotFound' }
  if (err instanceof LexAuthFactorError) {
    return { kind: 'two-factor', message: 'Enter the sign-in code sent to your email.', retryable: false }
  }
  if (err instanceof AuthorizationError) {
    return {
      kind: 'permission',
      message:
        err.error === 'access_denied'
          ? 'Sign-in was cancelled.'
          : 'Your server declined to authorize this app. Try signing in again.',
      retryable: true,
    }
  }
  if (err instanceof LoginError) {
    return { kind: 'identity', message: 'Could not sign in to that account. Check the handle or DID.', retryable: true }
  }
  if (err instanceof ResolverError) {
    return {
      kind: 'identity',
      message: "Could not find that account's sign-in server. Try entering the account's DID instead of its handle.",
      retryable: true,
    }
  }
  if (err instanceof TokenRefreshError) {
    return { kind: 'session-expired', message: 'Your session has expired. Please sign in again.', retryable: false }
  }
  if (err instanceof OAuthResponseError) {
    if (err.response.status >= 500) {
      return { kind: 'network', message: 'The sign-in server had a problem. Try again shortly.', retryable: true }
    }
    if (err.error === 'invalid_grant' || err.error === 'invalid_token') {
      return { kind: 'session-expired', message: 'Your session has expired. Please sign in again.', retryable: false }
    }
    if (err.error === 'invalid_request' && err.description) {
      return { kind: 'unknown', message: `This app's sign-in is misconfigured: ${err.description}`, retryable: false }
    }
    return { kind: 'unknown', message: 'Sign-in failed. Please try again.', retryable: true }
  }
  // Thrown when the reply is not the expected JSON
  if (err instanceof FetchResponseError) {
    return { kind: 'network', message: 'The sign-in server sent an unexpected response. Try again shortly.', retryable: true }
  }
  if (isValidationError(err)) {
    return { kind: 'validation', message: `The record did not pass schema validation: ${err.message}`, retryable: false }
  }
  if (err instanceof XrpcFetchError) {
    return { kind: 'network', message: 'Could not reach your PDS. Check your connection and try again.', retryable: true }
  }
  if (err instanceof XrpcResponseError) {
    const code = String(err.error)
    switch (code) {
      case 'AuthFactorTokenRequired':
        return { kind: 'two-factor', message: 'Enter the sign-in code sent to your email.', retryable: false }
      case 'AuthenticationRequired':
        return { kind: 'credentials', message: 'Handle or App Password is incorrect.', retryable: false }
      case 'ExpiredToken':
      case 'InvalidToken':
        return { kind: 'session-expired', message: 'Your session has expired. Please sign in again.', retryable: false }
      case 'AccountTakedown':
        return { kind: 'permission', message: 'This account has been suspended by its host.', retryable: false }
      case 'RecordNotFound':
        return { kind: 'not-found', message: 'That record no longer exists — it may have been deleted elsewhere.', retryable: false }
      case 'InvalidSwap':
        return { kind: 'unknown', message: 'The record changed elsewhere. Refresh and try again.', retryable: true }
      case 'InvalidRecord':
        return { kind: 'validation', message: 'Your PDS rejected the record as invalid.', retryable: false }
    }
    if (err.status === 429 || code === 'RateLimitExceeded') {
      return { kind: 'rate-limited', message: 'Your PDS is rate limiting requests. Wait a minute and retry.', retryable: true }
    }
    if (err.status === 401) {
      return { kind: 'session-expired', message: 'Your session has expired. Please sign in again.', retryable: false }
    }
    if (err.status === 403) {
      return { kind: 'permission', message: 'Your PDS refused this action (permission denied).', retryable: false }
    }
    if (err.status >= 500) {
      return { kind: 'network', message: `Your PDS returned a server error (${err.status}). Try again shortly.`, retryable: true }
    }
    return { kind: 'unknown', message: `Request failed (${code}).`, retryable: false }
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return { kind: 'network', message: 'Network request failed. Check your connection and try again.', retryable: true }
  }
  return { kind: 'unknown', message: 'Something went wrong. Please try again.', retryable: true }
}
