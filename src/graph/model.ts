/**
 * Source-agnostic graph model. Nothing here knows about Semble or Margin;
 * source adapters (src/services/sources/*) map their records into these
 * shapes, and the canvas, filters and layout only ever see these.
 */

export type GraphGroup = {
  /** Stable id, e.g. a collection AT URI. */
  id: string
  name: string
  description?: string
  itemCount?: number
  /** Who can add to it, e.g. Semble's CLOSED (personal) or OPEN. Raw value as stored. */
  accessType?: string
  createdAt?: string
  updatedAt?: string
}

export type GraphItem = {
  /** Stable id (AT URI of the underlying record). */
  id: string
  /** Source-specific kind, e.g. "URL" or "NOTE". */
  kind: string
  title: string
  url?: string
  domain?: string
  description?: string
  imageUrl?: string
  siteName?: string
  /** Persistent identifiers from the page metadata, when known. */
  doi?: string
  isbn?: string
  /** Short free-text notes attached to the item (e.g. Semble note cards). */
  notes: string[]
  /** Ids of the groups this item belongs to (within the loaded set). */
  groupIds: string[]
  /** Value other records use to point at this item (URL or AT URI). */
  endpoints: string[]
  createdAt?: string
  /**
   * Set when the item is outside the loaded groups and is shown only because
   * a link reaches it. `label` explains why, in the source's own terms.
   */
  external?: { label: string }
}

export type GraphLink = {
  id: string
  sourceId: string
  targetId: string
  /** Raw relationship type as stored. May be unknown to this client. */
  type?: string
  note?: string
  createdAt?: string
  /** True while an optimistic write is in flight. */
  pending?: boolean
}

export type Annotation = {
  id: string
  url: string
  text: string
  motivation?: string
  createdAt?: string
  pending?: boolean
}

export type GraphData = {
  items: GraphItem[]
  links: GraphLink[]
  /** Records that could not be placed (deleted cards, invalid records, …). */
  warnings: string[]
}
