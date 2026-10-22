/** Runtime configuration. Only public, non-secret endpoints belong here. */
export const config = {
  /** Unauthenticated service used for `com.atproto.identity.resolveHandle`. */
  handleResolver: import.meta.env.VITE_HANDLE_RESOLVER || 'https://public.api.bsky.app',
  /** PLC directory used to resolve `did:plc` documents. */
  plcDirectory: import.meta.env.VITE_PLC_DIRECTORY || 'https://plc.directory',
  /**
   * Link-preview service used to prefill a new card's title and description
   * (Bluesky's link-card extractor, CORS-enabled). Set VITE_LINK_PREVIEW_SERVICE
   * to an empty string to turn previews off.
   */
  linkPreviewService: import.meta.env.VITE_LINK_PREVIEW_SERVICE ?? 'https://cardyb.bsky.app/v1/extract',
  /**
   * Semble's public AppView API (open CORS, no auth) used for suggestions.
   * Set VITE_SEMBLE_API to an empty string to turn suggestions off.
   */
  sembleApi: import.meta.env.VITE_SEMBLE_API ?? 'https://api.semble.so',
  /** Semble's web app, for "View on Semble" and collection links. */
  sembleWeb: 'https://semble.so',
  /** Where people leave feedback about Assemblage. */
  feedbackUrl: 'https://userinput.app/s/did:plc:jwdpg464e3fd3ivtwbhzg346/3myex37dtun2b',
  /** Assemblage's own AT Protocol account. */
  assemblage: { handle: 'assemblage.mu.social', did: 'did:plc:jwdpg464e3fd3ivtwbhzg346' },
  bskyWeb: 'https://bsky.app',
  marginWeb: 'https://margin.at',
  /** Where users manage App Passwords on the default (Bluesky-hosted) PDS. */
  appPasswordHelpUrl: 'https://bsky.app/settings/app-passwords',
  /** Sent as the Margin `generator` so notes are attributable to this client. */
  appName: 'Assemblage',
} as const
