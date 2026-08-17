export interface InlineSegment {
  bold?: boolean;
  italic?: boolean;
  text: string;
  url?: string;
}

interface Style {
  bold?: boolean;
  italic?: boolean;
  url?: string;
}

const sameStyle = (left: InlineSegment, right: InlineSegment): boolean =>
  left.bold === right.bold &&
  left.italic === right.italic &&
  left.url === right.url;

const append = (
  segments: InlineSegment[],
  text: string,
  style: Style,
): void => {
  if (!text) return;
  const segment = { ...style, text };
  const previous = segments.at(-1);
  if (previous && sameStyle(previous, segment)) previous.text += text;
  else segments.push(segment);
};

const closing = (value: string, marker: string, start: number): number => {
  let index = value.indexOf(marker, start + marker.length);
  while (index >= 0) {
    const singleInsidePair =
      marker === "*" && (value[index - 1] === "*" || value[index + 1] === "*");
    if (!singleInsidePair && index > start + marker.length) return index;
    index = value.indexOf(marker, index + 1);
  }
  return -1;
};

const parse = (value: string, style: Style): InlineSegment[] => {
  const segments: InlineSegment[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (value[cursor] === "[") {
      const labelEnd = value.indexOf("](", cursor + 1);
      const urlEnd = labelEnd < 0 ? -1 : value.indexOf(")", labelEnd + 2);
      const url = urlEnd < 0 ? "" : value.slice(labelEnd + 2, urlEnd).trim();
      if (labelEnd > cursor + 1 && url && !/\s/.test(url)) {
        segments.push(
          ...parse(value.slice(cursor + 1, labelEnd), { ...style, url }),
        );
        cursor = urlEnd + 1;
        continue;
      }
    }

    const marker = value.startsWith("***", cursor)
      ? "***"
      : value.startsWith("**", cursor)
        ? "**"
        : value[cursor] === "*"
          ? "*"
          : "";
    const end = marker ? closing(value, marker, cursor) : -1;
    if (end >= 0) {
      segments.push(
        ...parse(value.slice(cursor + marker.length, end), {
          ...style,
          bold: marker.length >= 2 ? true : style.bold,
          italic: marker.length % 2 === 1 ? true : style.italic,
        }),
      );
      cursor = end + marker.length;
      continue;
    }

    let next = cursor + 1;
    while (next < value.length && value[next] !== "[" && value[next] !== "*") {
      next++;
    }
    append(segments, value.slice(cursor, next), style);
    cursor = next;
  }

  return segments;
};

export const inlineSegments = (value: string): InlineSegment[] =>
  parse(value, {});

export const visibleText = (value: string): string =>
  inlineSegments(value)
    .map((segment) => segment.text)
    .join("");
