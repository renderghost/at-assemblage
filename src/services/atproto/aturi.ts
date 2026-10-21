import { AtUri } from '@atproto/syntax'

export function rkeyOf(uri: string): string {
  return new AtUri(uri).rkey
}

export function isAtUri(value: string): boolean {
  return value.startsWith('at://')
}

export function collectionOf(uri: string): string {
  return new AtUri(uri).collection
}
