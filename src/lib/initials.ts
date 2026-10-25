const graphemes = new Intl.Segmenter("fr", { granularity: "grapheme" })

export function initialGlyph(value: string, fallback = "?") {
  return graphemes.segment(value.trim())[Symbol.iterator]().next().value?.segment.toLocaleUpperCase("fr") || fallback
}

export function initials(value: string) {
  const parts = value.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2)
  return parts.length ? parts.map(part => initialGlyph(part)).join("") : "?"
}
