/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const OAUTH_SCOPE =
  'atproto repo:network.cosmik.collection repo:network.cosmik.card ' +
  'repo:network.cosmik.collectionLink repo:network.cosmik.connection ' +
  'repo:at.margin.note'

function siteOrigin(mode: string): string {
  const env = loadEnv(mode, process.cwd(), '')
  const explicit = env.VITE_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  // VERCEL_URL is the individual deployment (`assemblage-abc123.vercel.app`),
  // Production use a custom domain, while previews have their own origin.
  const onVercel =
    process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL
  return onVercel ? `https://${onVercel}`.replace(/\/+$/, '') : ''
}

/**
 * Social crawlers need absolute og:image / og:url values. Resolve them at build time from
 * VITE_SITE_URL (or Vercel's production URL); with neither set the tags fall back to
 * root-relative paths, which is fine for local dev.
 */
function siteUrl(mode: string): Plugin {
  return {
    name: 'assemblage-site-url',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', siteOrigin(mode))
    },
  }
}

/**
 * Serves /client-metadata.json for the origin it is actually deployed on
 */
function clientMetadata(mode: string): Plugin {
  return {
    name: 'assemblage-client-metadata',
    configureServer(server) {
      const serve = (req: { url?: string }, res: ServerResponse, next: () => void) => {
        if ((req.url ?? '').split('?')[0] !== '/client-metadata.json') return next()
        const base = siteOrigin(mode)
        if (!base) {
          res.statusCode = 404
          res.end('No site URL configured; using the localhost OAuth client.')
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(metadataFor(base), null, 2))
      }
      server.middlewares.use(serve)
    },
    generateBundle() {
      const base = siteOrigin(mode)
      if (!base) {
        this.error(
          'No public site origin is configured, so the OAuth client metadata cannot be generated ' +
            'and sign-in would fail in production. Set VITE_SITE_URL (e.g. https://assemblage.renderg.host).',
        )
        return
      }
      this.emitFile({
        type: 'asset',
        fileName: 'client-metadata.json',
        source: JSON.stringify(metadataFor(base), null, 2),
      })
    },
  }
}

function metadataFor(base: string) {
  return {
    client_id: `${base}/client-metadata.json`,
    client_name: 'Assemblage',
    client_uri: base,
    redirect_uris: [`${base}/`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: OAUTH_SCOPE,
    application_type: 'web',
    dpop_bound_access_tokens: true,
    token_endpoint_auth_method: 'none',
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), siteUrl(mode), clientMetadata(mode)],
  // Serve dev over the loopback IP rather than "localhost"
  server: { host: '127.0.0.1' },
  // The lazily loaded ELK layout chunk is ~1.4 MB on its own.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    // happy-dom, not jsdom: jsdom's separate typed-array realm breaks CID hashing in multiformats.
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}))
