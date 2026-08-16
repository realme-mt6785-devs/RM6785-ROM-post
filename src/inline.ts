export interface InlineSegment {
  text: string;
  url?: string;
}

// Inline links are deliberately the only Markdown accepted in user-facing text.
// Keeping the grammar narrow makes Telegram entity offsets deterministic.
const LINK = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;

export const inlineSegments = (value: string): InlineSegment[] => {
  const segments: InlineSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(LINK)) {
    const index = match.index;
    if (index > cursor) segments.push({ text: value.slice(cursor, index) });
    segments.push({ text: match[1], url: match[2] });
    cursor = index + match[0].length;
  }

  if (cursor < value.length) segments.push({ text: value.slice(cursor) });
  return segments;
};

export const visibleText = (value: string): string =>
  inlineSegments(value)
    .map((segment) => segment.text)
    .join("");
