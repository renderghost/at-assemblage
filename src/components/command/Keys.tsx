function caps(keys: string): string[] {
  return keys.split(' ').flatMap((part) => {
    if (part.startsWith('Ctrl+')) return ['Ctrl', part.slice(5)]
    const m = /^([⌘⇧⌥]+)(.+)$/.exec(part)
    return m ? [...m[1]!, m[2]!] : [part]
  })
}

/** A shortcut as key caps: "⌘K" → ⌘ K, "Ctrl+K" → Ctrl K, "+ −" → + −. */
export function Keys({ keys, className = '' }: { keys: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {caps(keys)
        .filter(Boolean)
        .map((k, i) => (
          <kbd
            key={i}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] font-medium text-ink-2"
          >
            {k}
          </kbd>
        ))}
    </span>
  )
}
