import { useUiStore } from '../../state/uiStore'

/**
 * Wordmark: swaps between the light and dark SVGs with the OS colour scheme
 * and scales to fill its container while keeping its aspect ratio.
 */
export function Logo({ className = '' }: { className?: string }) {
  const theme = useUiStore((s) => s.preferences.theme)
  // An explicit theme preference overrides the operating system's.
  const darkMedia = theme === 'dark' ? 'all' : theme === 'light' ? 'not all' : '(prefers-color-scheme: dark)'
  return (
    <picture className={`block h-full w-full ${className}`}>
      <source srcSet="/logo-dark.svg" media={darkMedia} />
      <img
        src="/logo-light.svg"
        alt="Assemblage"
        className="h-full w-full object-contain object-left"
        draggable={false}
      />
    </picture>
  )
}
