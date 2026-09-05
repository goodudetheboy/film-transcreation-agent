export interface FlagProps {
  code?: string;
  className?: string;
}

/** Renders a crisp SVG flag via the flag-icons package (`fi fi-<cc>` classes) —
 * emoji flags (regional-indicator codepoints) don't render as flags on Windows,
 * they fall back to a two-letter glyph, so this avoids relying on the OS font.
 * Falls back to a globe glyph when the country has no known ISO code. */
export function Flag({ code, className }: FlagProps) {
  if (!code) {
    return (
      <span className={`flag-fallback${className ? ` ${className}` : ''}`} role="img" aria-label="flag">
        🌐
      </span>
    );
  }
  return <span className={`fi fi-${code.toLowerCase()}${className ? ` ${className}` : ''}`} role="img" aria-label={`${code} flag`} />;
}
