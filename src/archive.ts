import type { Device, Post, PostType, ReleaseType, Stability } from "./types";

import { checkSchema } from "./schema";

export interface ArchiveEntity {
  kind: string;
  length: number;
  offset: number;
  url?: string;
}

export interface ArchiveMessage {
  chatId: number;
  entities: readonly ArchiveEntity[];
  id: number;
  mediaType: string | null;
  sentAt?: string;
  text: string;
}

export interface ArchiveRichMessage {
  blocks: readonly unknown[];
  chatId: number;
  id: number;
  sentAt?: string;
}

export type ArchiveResult =
  | { eligible: true; post: Post }
  | { candidate: boolean; eligible: false; reason: string };

interface RichSegment {
  text: string;
  url?: string;
}

interface Line {
  start: number;
  text: string;
}

const POST_TYPES: Record<string, PostType> = {
  KERNEL: "kernel",
  RECOVERY: "recovery",
  ROM: "rom",
};

const DEVICES = new Set<Device>([
  "RM6785",
  "nemo",
  "salaa",
  "RMX2001",
  "RMX2151",
]);

const MEDIA_TYPES = new Set(["document", "photo", "video"]);
const HEADINGS = ["changelog", "bugs", "notes", "downloads"] as const;

class NotEligible extends Error {}

const fail = (reason: string): never => {
  throw new NotEligible(reason);
};

const splitLines = (text: string): Line[] => {
  let start = 0;
  return text.split("\n").map((text) => {
    const line = { start, text };
    start += text.length + 1;
    return line;
  });
};

const normalizedUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://")) return `https://${url.slice(7)}`;

  const domain = url.match(/^tg:\/\/resolve\?domain=([^&]+)/i)?.[1];
  return domain ? `https://t.me/${domain}` : undefined;
};

const richSegments = (value: unknown, url?: string): RichSegment[] => {
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, any>;

  if (node._ === "textPlain") return [{ text: String(node.text ?? ""), url }];
  if (node._ === "textConcat") {
    return (node.texts as unknown[]).flatMap((part) => richSegments(part, url));
  }
  if (node._ === "textUrl") {
    return richSegments(node.text, normalizedUrl(node.url) ?? url);
  }
  if (node.text) return richSegments(node.text, url);
  return [];
};

const inlineText = (
  value: string,
  start: number,
  entities: readonly ArchiveEntity[],
): string => {
  const links = entities
    .map((entity) => ({ ...entity, url: normalizedUrl(entity.url) }))
    .filter(
      (entity) =>
        entity.kind === "text_link" &&
        entity.url &&
        entity.offset >= start &&
        entity.offset + entity.length <= start + value.length,
    )
    .sort((left, right) => left.offset - right.offset);

  let cursor = 0;
  let result = "";
  for (const link of links) {
    const relative = link.offset - start;
    if (relative < cursor) continue;
    result += value.slice(cursor, relative);
    result += `[${value.slice(relative, relative + link.length)}](${link.url})`;
    cursor = relative + link.length;
  }

  return result + value.slice(cursor);
};

/**
 * Strips leading decoration so a line-anchored pattern still matches. Older
 * posts prefix their labels with whatever emoji the author liked — `ℹ️ Version:`,
 * `📅 Build date:`, `📎 File size:`, `👤 by` — and hardcoding each one is how
 * `Version:` came to be missed on the EvolutionX posts.
 */
const undecorated = (line: Line): Line => {
  const decoration = line.text.match(
    /^(?:[\s\p{Extended_Pictographic}\p{So}\p{Sk}•▪◦*=|-]|\uFE0F|\u200D)+/u,
  );
  if (!decoration) return line;

  const width = decoration[0].length;
  return { start: line.start + width, text: line.text.slice(width) };
};

const valueAfter = (
  line: Line,
  pattern: RegExp,
  entities: readonly ArchiveEntity[],
): string | undefined => {
  const match = line.text.match(pattern);
  if (!match) return undefined;

  const raw = line.text.slice(match[0].length);
  const leading = raw.search(/\S/);
  if (leading < 0) return undefined;
  const value = raw.slice(leading).trim();
  return inlineText(value, line.start + match[0].length + leading, entities);
};

const plainAfter = (line: Line, pattern: RegExp): string | undefined => {
  const match = line.text.match(pattern);
  const value = match ? line.text.slice(match[0].length).trim() : "";
  return value || undefined;
};

const linkInRange = (
  start: number,
  end: number,
  entities: readonly ArchiveEntity[],
): string | undefined =>
  entities
    .filter(
      (entity) =>
        entity.kind === "text_link" &&
        entity.offset < end &&
        entity.offset + entity.length > start,
    )
    .map((entity) => normalizedUrl(entity.url))
    .find((url): url is string => Boolean(url));

const linkOnLine = (
  line: Line,
  entities: readonly ArchiveEntity[],
): string | undefined =>
  linkInRange(line.start, line.start + line.text.length + 1, entities);

const chooseDevice = (hashtags: string[]): Device => {
  const devices = hashtags.filter((tag): tag is Device =>
    DEVICES.has(tag as Device),
  );
  const unique = new Set(devices);

  if (unique.has("RM6785")) return "RM6785";
  if (
    (unique.has("nemo") || unique.has("RMX2001")) &&
    (unique.has("salaa") || unique.has("RMX2151"))
  ) {
    return "RM6785";
  }
  if (unique.has("nemo")) return "nemo";
  if (unique.has("salaa")) return "salaa";
  if (unique.has("RMX2001")) return "RMX2001";
  if (unique.has("RMX2151")) return "RMX2151";
  return fail("no supported device hashtag was found");
};

const headingName = (line: Line): (typeof HEADINGS)[number] | undefined => {
  const normalized = line.text.trim().toLowerCase();
  return HEADINGS.find((heading) => heading === normalized);
};

const sectionBullets = (
  lines: Line[],
  start: number,
  end: number,
  entities: readonly ArchiveEntity[],
): string[] => {
  const bullets: string[] = [];

  for (const line of lines.slice(start, end)) {
    if (!line.text.trim()) continue;
    const marker = line.text.match(/^\s*•\s*/);
    if (!marker) {
      if (!bullets.length) fail("section text appears before its first bullet");
      bullets[bullets.length - 1] += ` ${line.text.trim()}`;
      continue;
    }

    const value = line.text.slice(marker[0].length).trim();
    if (!value) continue;
    const leading = line.text.slice(marker[0].length).search(/\S/);
    bullets.push(
      inlineText(
        value,
        line.start + marker[0].length + Math.max(leading, 0),
        entities,
      ),
    );
  }

  if (!bullets.length) fail("section has no bullets");
  return bullets;
};

const normalizeSize = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (
    /^\d+(?:\.\d+)? ?(?:MB|GB|MiB|GiB)(?:\s*\|\s*\d+(?:\.\d+)? ?(?:MB|GB|MiB|GiB))*$/.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  const sizes = [
    ...value.matchAll(/\d+(?:\.\d+)?\s*(?:GiB|MiB|GB|MB|G|M)\b/gi),
  ];
  if (!sizes.length) return undefined;

  return sizes
    .map((match) => {
      const compact = match[0].replace(/\s+/g, "");
      return compact
        .replace(/MiB$/i, "MiB")
        .replace(/GiB$/i, "GiB")
        .replace(/MB$/i, "MB")
        .replace(/GB$/i, "GB")
        .replace(/M$/i, "MB")
        .replace(/G$/i, "GB");
    })
    .join(" | ");
};

const footerName = (line: Line): keyof Post["links"] | undefined => {
  const label = line.text.trim().toLowerCase();
  if (label === "source" || label === "sources") return "sources";
  if (label === "screenshot" || label === "screenshots") return "screenshots";
  if (label === "support group") return "supportGroup";
  if (label === "donate" || label === "donation") return "donate";
  return undefined;
};

/**
 * Lines that look like a title but are not one: section labels, the "New build
 * available" header used by posts that carry no title at all, and the all-caps
 * device warnings that sat above the title before salaa-only posts were
 * standardised.
 */
/** Android release names as some posts spell them, e.g. "Version: Eleven". */
const ANDROID_CODENAME: Record<string, string> = {
  eleven: "11",
  thirteen: "13",
  twelve: "12",
};

const notATitle = (text: string): boolean =>
  /^(?:build type|download|changelog)/i.test(text) ||
  /\bnew\b.*\bbuild available\b/i.test(text) ||
  /\bnot\s+for\b/i.test(text) ||
  /^(?:release|credits?|by|xda)\b/i.test(text);

/** Drops the badges a title carries so only the build's name is left. */
const bareName = (text: string): string =>
  text
    .replace(/\[(?:STABLE|BETA|ALPHA)\]/gi, "")
    .replace(/\b(?:OFFICIAL|UNOFFICIAL|STABLE|BETA|ALPHA)\b/gi, "")
    // "BLISS OS for RMX2001" and "DerpFest | ALPHA - OFFICIAL" both carry a
    // device or badge tail that is already its own field.
    .replace(/\s+for\s+\S.*$/i, "")
    .replace(/[\s•▪◦*=|-]+$/u, "")
    .trim();

const buildDateFrom = (
  value: string | undefined,
  sentAt: string | undefined,
): string => {
  // Try year-first before day-first. The day-first pattern cannot match at the
  // start of "2021-02-14", but it does match two characters in, reading
  // "21-02-14" as 21 February 2014 — which is how m695 and m897 were archived
  // with dates in 2014 and 2004.
  const iso = value?.match(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const numeric = value?.match(/\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})\b/);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    return `${year}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  }

  // A written date like "2021 October 15 01:55" names a calendar day, with no
  // timezone in it. Date parses that as local midnight, so converting through
  // toISOString shifts it a day west of UTC — the same archiver run produced
  // 2021-10-14 on a +08 machine and 2021-10-15 in CI. Read the fields back off
  // the parsed date instead, which is what the caption meant either way.
  const written = value ? new Date(value) : new Date(Number.NaN);
  if (!Number.isNaN(written.getTime())) {
    const month = String(written.getMonth() + 1).padStart(2, "0");
    const day = String(written.getDate()).padStart(2, "0");
    return `${written.getFullYear()}-${month}-${day}`;
  }
  if (sentAt) return new Date(sentAt).toISOString().slice(0, 10);
  return fail("build date could not be determined");
};

/**
 * A build cannot be newer than the post announcing it, and the channel does not
 * carry builds from years before. Captions do sometimes claim otherwise —
 * m2359 really does read 06-02-1969, and m897 gave a date two weeks after its
 * own post — so an implausible result defers to when the message was sent.
 */
const plausibleDate = (parsed: string, sentAt: string | undefined): string => {
  if (!sentAt) return parsed;

  const sent = new Date(sentAt);
  const built = new Date(`${parsed}T00:00:00Z`);
  if (Number.isNaN(built.getTime())) return sent.toISOString().slice(0, 10);

  const days = (built.getTime() - sent.getTime()) / 86_400_000;
  if (days > 1 || days < -730) return sent.toISOString().slice(0, 10);
  return parsed;
};

const legacySection = (
  lines: Line[],
  startPattern: RegExp,
  entities: readonly ArchiveEntity[],
): string[] | undefined => {
  const start = lines.findIndex((line) => startPattern.test(line.text.trim()));
  if (start < 0) return undefined;

  const stop = lines.findIndex(
    (line, index) =>
      index > start &&
      /^(?:bugs?|known issues?|notes?|downloads?|sources?|screenshots?|support(?: group)?|credits?)\b/i.test(
        line.text.trim(),
      ),
  );
  const end = stop < 0 ? lines.length : stop;
  const values: string[] = [];

  for (const line of lines.slice(start + 1, end)) {
    const marker = line.text.match(/^\s*[•*-]\s*/);
    if (!marker) continue;
    const value = line.text.slice(marker[0].length).trim();
    if (!value) continue;
    values.push(
      inlineText(value, line.start + marker[0].length, entities).slice(0, 300),
    );
  }

  return values.length ? values.slice(0, 40) : undefined;
};

const legacyValue = (
  lines: Line[],
  pattern: RegExp,
  entities: readonly ArchiveEntity[],
): string | undefined => {
  const line = lines.map(undecorated).find((item) => pattern.test(item.text));
  return line ? valueAfter(line, pattern, entities) : undefined;
};

const parseLegacy = (message: ArchiveMessage, hashtags: string[]): Post => {
  if (!MEDIA_TYPES.has(message.mediaType ?? ""))
    fail("post has no banner media");
  const postType = POST_TYPES[hashtags[1]?.toUpperCase()];
  if (!postType) fail("second hashtag is not a supported post type");

  const lines = splitLines(message.text);
  const releaseTag = hashtags.find((tag) => /^(un)?official$/i.test(tag));
  const releaseType = releaseTag?.toUpperCase() as ReleaseType | undefined;

  let device: Device;
  try {
    device = chooseDevice(hashtags);
  } catch {
    if (/\bRMX200[12]\b|\bwasabi\b/i.test(message.text)) device = "RMX2001";
    else if (/\bRMX2151\b/i.test(message.text)) device = "RMX2151";
    else if (/Realme 7|Narzo 20 Pro|Narzo 30/i.test(message.text)) {
      device = "RM6785";
    } else device = "RMX2001";
  }

  const androidTag = hashtags
    .map((tag) => tag.match(/^A(1[0-7])([A-Za-z0-9.]*)$/i))
    .find((match) => match !== null);
  const androidText = message.text.match(
    /Android\s*(?::|version:?)?\s*(1[0-7])/i,
  );
  const namedAndroid = message.text.match(/\b(Eleven|Twelve|Thirteen)\b/i)?.[1];
  const androidMajor =
    androidTag?.[1] ??
    androidText?.[1] ??
    (namedAndroid ? ANDROID_CODENAME[namedAndroid.toLowerCase()] : undefined) ??
    message.text
      .match(/LineageOS[- ](18|19|20|21|22)/i)?.[1]
      ?.replace(/^(18|19|20|21|22)$/, (version) => String(Number(version) - 7));
  if (postType === "rom" && !androidMajor) {
    fail("Android version could not be determined");
  }
  const androidVersion =
    postType === "rom"
      ? `${androidMajor}${androidTag?.[2] ? ` ${androidTag[2]}` : ""}`
      : undefined;

  const ruiTag = hashtags
    .map((tag) => tag.match(/^RUI([1-3])/i))
    .find((match) => match !== null);
  const ruiText = message.text.match(/(?:RUI|Realme\s*UI)[\s.-]*([1-3])/i);
  const ruiVersion = Number(ruiTag?.[1] ?? ruiText?.[1] ?? 2) as 1 | 2 | 3;

  // "New build available for Realme 6 (RMX2001)" is a header, not a title, and
  // the posts using it carry no title at all — so it has to be rejected here
  // rather than after the "for Realme" split, which would otherwise yield a
  // name of "New build available".
  // `\b(?:...|OS\b|...)` needs a boundary *before* OS, so it finds a free-standing
  // "OS" but never a suffix like "NezukoOS" — which is how a "• Source Built
  // kernel" bullet came to win over the real title. Opening with the post's own
  // tag is the reliable signal, and narrower than loosening that alternation.
  const opensWithTag = (text: string): boolean =>
    text.toLowerCase().startsWith(hashtags[0]!.toLowerCase());

  const titleLine = lines.find((line, index) => {
    if (index === 0) return false;
    const bare = undecorated(line).text.trim();
    if (notATitle(bare)) return false;
    return (
      opensWithTag(bare) ||
      /\b(?:for\s+Realme|kernel|recovery|OS\b|ROM\b)/i.test(line.text)
    );
  });
  const rawVersion = legacyValue(
    lines,
    /^\s*Version\s*:\s*/i,
    message.entities,
  );
  const version =
    rawVersion && rawVersion.toLowerCase() in ANDROID_CODENAME
      ? undefined
      : rawVersion;
  let name = titleLine?.text.match(/^(.*?)\s+for\s+Realme\b/i)?.[1].trim();
  if (!name && titleLine) name = bareName(undecorated(titleLine).text);
  name ||= `${hashtags[0]}${version ? ` ${version}` : ""}`;
  name = name.slice(0, 96);

  const stabilityTag = hashtags.find((tag) =>
    /^(stable|beta|alpha)$/i.test(tag),
  );
  const stability =
    ((
      message.text.match(/\[(STABLE|BETA|ALPHA)\]/i)?.[1] ?? stabilityTag
    )?.toUpperCase() as Stability | undefined) ?? "STABLE";

  const author =
    legacyValue(
      lines,
      /^\s*(?:•\s*)?(?:Build\s+)?Author\s*(?::|-)\s*/i,
      message.entities,
    ) ??
    legacyValue(lines, /^\s*Maintainer\s*:\s*/i, message.entities) ??
    legacyValue(lines, /^\s*(?:By\s*:|by)\s*/i, message.entities) ??
    message.text.match(/👤\s*by\s+([^\n]+)/i)?.[1].trim() ??
    "Unknown";

  const displayedDate =
    legacyValue(
      lines,
      /^\s*(?:📅\s*)?(?:•\s*)?Build date\s*:\s*/i,
      message.entities,
    ) ?? legacyValue(lines, /^\s*Build Date\s*:\s*/i, message.entities);
  const buildDate = plausibleDate(
    buildDateFrom(displayedDate, message.sentAt),
    message.sentAt,
  );

  const changelog = legacySection(
    lines,
    /^(?:device\s+|rom\s+)?changelogs?\s*:?(?:\s+HERE)?$/i,
    message.entities,
  ) ?? ["See original channel post"];
  const bugs = legacySection(
    lines,
    /^(?:bugs?|known issues?)\s*:?.*$/i,
    message.entities,
  ) ?? ["Not listed in original post"];
  const notes = legacySection(lines, /^notes?\s*:?.*$/i, message.entities);

  const buildTypeLine = lines.find((line) =>
    /^\s*(?:•\s*)?Build Type\s*:/i.test(line.text),
  );
  const buildType = buildTypeLine
    ? plainAfter(buildTypeLine, /^\s*(?:•\s*)?Build Type\s*:\s*/i)?.slice(0, 48)
    : undefined;
  const fileSizeLine = lines.find((line) =>
    /^\s*(?:📎\s*)?(?:•\s*)?File Size\s*:/i.test(line.text),
  );
  const rawSize = fileSizeLine
    ? plainAfter(fileSizeLine, /^\s*(?:📎\s*)?(?:•\s*)?File Size\s*:\s*/i)
    : undefined;
  const fileSize = rawSize ? normalizeSize(rawSize) : undefined;

  const downloadLine = lines.find((line) => /download/i.test(line.text));
  const downloadUrl = downloadLine
    ? linkInRange(downloadLine.start, message.text.length, message.entities)
    : undefined;
  if (!downloadUrl) fail("download link could not be determined");

  const links: Record<string, string> = {};
  for (const line of lines) {
    const name = footerName(line);
    const url = name ? linkOnLine(line, message.entities) : undefined;
    if (name && url && !links[name]) links[name] = url;
  }

  let kernelVersion: string | undefined;
  if (postType === "kernel") {
    kernelVersion =
      legacyValue(
        lines,
        /^\s*(?:•\s*)?Kernel Version\s*:\s*/i,
        message.entities,
      ) ?? message.text.match(/\b\d+\.\d+\.\d+\b/)?.[0];
  }

  const post = {
    postType,
    name,
    tag: hashtags[0],
    stability,
    releaseType,
    device,
    androidVersion,
    kernelVersion,
    ruiVersion,
    author: author.slice(0, 96),
    buildDate,
    banner: `telegram-message:${message.chatId}:${message.id}`,
    changelog,
    bugs,
    notes,
    download: { buildType, fileSize, url: downloadUrl },
    links: {
      sources: links.sources,
      screenshots: links.screenshots,
      supportGroup: links.supportGroup,
      donate: links.donate,
    },
  } as Post;

  const cleaned = JSON.parse(JSON.stringify(post)) as Post;
  const problems = checkSchema(cleaned);
  if (problems.length) {
    fail(
      problems
        .map((problem) => `${problem.where || "post"}: ${problem.message}`)
        .join("; "),
    );
  }
  return cleaned;
};

const parse = (message: ArchiveMessage, hashtags: string[]): Post => {
  if (!MEDIA_TYPES.has(message.mediaType ?? ""))
    fail("post has no banner media");

  const postType = POST_TYPES[hashtags[1]?.toUpperCase()];
  if (!postType) fail("second hashtag is not a supported post type");

  const releaseTag = hashtags.find((tag) => /^(un)?official$/i.test(tag));
  const releaseType = releaseTag?.toUpperCase() as ReleaseType | undefined;
  const device = chooseDevice(hashtags);

  const androidTag = hashtags
    .map((tag) => tag.match(/^A(1[0-7])([A-Za-z0-9.]*)$/i))
    .find((match) => match !== null);
  const androidVersion = androidTag
    ? `${androidTag[1]}${androidTag[2] ? ` ${androidTag[2]}` : ""}`
    : undefined;
  if (postType === "rom" && !androidVersion) {
    fail("no supported Android hashtag was found");
  }

  const ruiTag = hashtags
    .map((tag) => tag.match(/^RUI([1-3])$/i))
    .find((match) => match !== null);
  const inferredRui = message.text.match(/(?:RUI|Realme\s*UI)[\s.-]*([1-3])/i);
  const ruiVersion = Number(ruiTag?.[1] ?? inferredRui?.[1]);
  if (!ruiVersion) fail("RealmeUI version could not be determined");

  const lines = splitLines(message.text);
  // Not simply the first non-blank line: a warning banner sometimes sits above
  // the title, and taking it wholesale is how m2164 was archived as "NOT".
  const titleIndex = lines.findIndex(
    (line, index) =>
      index > 0 &&
      Boolean(line.text.trim()) &&
      !notATitle(undecorated(line).text.trim()),
  );
  if (titleIndex < 0) fail("title is missing");
  const title = lines[titleIndex].text.trim();
  const name = title.match(/^(.*?)\s+for\s+Realme\b/i)?.[1].trim();
  if (!name) fail("title does not identify a build name");
  const stability =
    (title.match(/\[(STABLE|BETA|ALPHA)\]/i)?.[1].toUpperCase() as
      Stability | undefined) ?? "STABLE";

  const headingIndexes = new Map<(typeof HEADINGS)[number], number>();
  lines.forEach((line, index) => {
    const heading = headingName(line);
    if (heading && !headingIndexes.has(heading))
      headingIndexes.set(heading, index);
  });
  const changelogIndex = headingIndexes.get("changelog") ?? -1;
  const bugsIndex = headingIndexes.get("bugs") ?? -1;
  const notesIndex = headingIndexes.get("notes");
  const downloadsIndex = headingIndexes.get("downloads") ?? -1;
  if (
    changelogIndex <= titleIndex ||
    bugsIndex <= changelogIndex ||
    downloadsIndex <= bugsIndex ||
    (notesIndex !== undefined &&
      (notesIndex <= bugsIndex || notesIndex >= downloadsIndex))
  ) {
    fail("required sections are missing or out of order");
  }

  const info = lines.slice(titleIndex + 1, changelogIndex);
  const authorLine = info.find((line) =>
    /^\s*•?\s*Author\s*:/i.test(line.text),
  );
  const dateLine = info.find((line) =>
    /^\s*•?\s*Build date\s*:/i.test(line.text),
  );
  if (!authorLine || !dateLine) {
    throw new NotEligible("author or build date is missing");
  }
  const author = valueAfter(
    authorLine,
    /^\s*•?\s*Author\s*:\s*/i,
    message.entities,
  );
  const displayedDate = valueAfter(
    dateLine,
    /^\s*•?\s*Build date\s*:\s*/i,
    message.entities,
  );
  if (!author || !displayedDate) {
    throw new NotEligible("author or build date is empty");
  }
  const date = displayedDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!date) throw new NotEligible("build date is not DD-MM-YYYY");
  const buildDate = plausibleDate(
    `${date[3]}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}`,
    message.sentAt,
  );

  let kernelVersion: string | undefined;
  if (postType === "kernel") {
    const versionLine = info.find((line) =>
      /^\s*•?\s*Kernel version\s*:/i.test(line.text),
    );
    kernelVersion = versionLine
      ? valueAfter(
          versionLine,
          /^\s*•?\s*Kernel version\s*:\s*/i,
          message.entities,
        )
      : message.text.match(/\b\d+\.\d+\.\d+\b/)?.[0];
  }

  const changelog = sectionBullets(
    lines,
    changelogIndex + 1,
    bugsIndex,
    message.entities,
  );
  const bugs = sectionBullets(
    lines,
    bugsIndex + 1,
    notesIndex ?? downloadsIndex,
    message.entities,
  );
  const notes =
    notesIndex === undefined
      ? undefined
      : sectionBullets(lines, notesIndex + 1, downloadsIndex, message.entities);

  const footerLines = lines
    .map((line, index) => ({ index, line, name: footerName(line) }))
    .filter(
      (
        item,
      ): item is { index: number; line: Line; name: keyof Post["links"] } =>
        item.index > downloadsIndex && item.name !== undefined,
    );
  const footerStart = footerLines[0]?.index ?? lines.length;
  const downloadLines = lines.slice(downloadsIndex + 1, footerStart);
  const buildTypeLine = downloadLines.find((line) =>
    /^\s*•?\s*Build type\s*:/i.test(line.text),
  );
  const fileSizeLine = downloadLines.find((line) =>
    /^\s*•?\s*File size\s*:/i.test(line.text),
  );
  const buildType = buildTypeLine
    ? plainAfter(buildTypeLine, /^\s*•?\s*Build type\s*:\s*/i)?.slice(0, 48)
    : undefined;
  const rawSize = fileSizeLine
    ? plainAfter(fileSizeLine, /^\s*•?\s*File size\s*:\s*/i)
    : undefined;
  if (!rawSize) throw new NotEligible("file size is missing");
  const fileSize = normalizeSize(rawSize);

  const downloadStart = lines[downloadsIndex + 1]?.start ?? message.text.length;
  const downloadEnd = lines[footerStart]?.start ?? message.text.length;
  const downloadUrl = linkInRange(downloadStart, downloadEnd, message.entities);
  if (!downloadUrl) fail("download link is missing");

  const links: Record<string, string> = {};
  for (const footer of footerLines) {
    const url = linkOnLine(footer.line, message.entities);
    if (url && !links[footer.name]) links[footer.name] = url;
  }

  const post = {
    postType,
    name,
    tag: hashtags[0],
    stability,
    releaseType,
    device,
    androidVersion,
    kernelVersion,
    ruiVersion: ruiVersion as 1 | 2 | 3,
    author,
    buildDate,
    banner: `telegram-message:${message.chatId}:${message.id}`,
    changelog,
    bugs,
    notes,
    download: { buildType, fileSize, url: downloadUrl },
    links: {
      sources: links.sources,
      screenshots: links.screenshots,
      supportGroup: links.supportGroup,
      donate: links.donate,
    },
  } as Post;

  const cleaned = JSON.parse(JSON.stringify(post)) as Post;
  const problems = checkSchema(cleaned);
  if (problems.length) {
    fail(
      problems
        .map((problem) => `${problem.where || "post"}: ${problem.message}`)
        .join("; "),
    );
  }

  return cleaned;
};

export const archivePost = (message: ArchiveMessage): ArchiveResult => {
  const firstLine = message.text.split("\n", 1)[0] ?? "";
  const hashtags = firstLine.match(/#\w+/g)?.map((tag) => tag.slice(1));
  const candidate = Boolean(hashtags && POST_TYPES[hashtags[1]?.toUpperCase()]);
  if (!candidate || !hashtags) {
    return { candidate: false, eligible: false, reason: "not a build post" };
  }

  try {
    return { eligible: true, post: parse(message, hashtags) };
  } catch (error) {
    if (error instanceof NotEligible) {
      try {
        return { eligible: true, post: parseLegacy(message, hashtags) };
      } catch (legacyError) {
        if (legacyError instanceof NotEligible) {
          return {
            candidate: true,
            eligible: false,
            reason: legacyError.message,
          };
        }
        throw legacyError;
      }
    }
    throw error;
  }
};

export const archiveRichPost = (message: ArchiveRichMessage): ArchiveResult => {
  let text = "";
  const entities: ArchiveEntity[] = [];
  let mediaType: string | null = null;
  let previous = "";

  const blank = (): void => {
    if (text && !text.endsWith("\n\n"))
      text += text.endsWith("\n") ? "\n" : "\n\n";
  };

  const line = (segments: RichSegment[], prefix = ""): void => {
    if (text && !text.endsWith("\n")) text += "\n";
    text += prefix;
    for (const segment of segments) {
      const offset = text.length;
      text += segment.text;
      if (segment.url) {
        entities.push({
          kind: "text_link",
          length: segment.text.length,
          offset,
          url: segment.url,
        });
      }
    }
    text += "\n";
  };

  for (const raw of message.blocks) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, any>;

    if (block._ === "pageBlockPhoto") {
      mediaType = "photo";
      continue;
    }
    if (block._ === "pageBlockVideo") {
      mediaType = "video";
      continue;
    }
    if (block._ === "pageBlockHeading1") {
      blank();
      line(richSegments(block.text));
      previous = "heading1";
      continue;
    }
    if (block._ === "pageBlockHeading2") {
      blank();
      line(richSegments(block.text));
      previous = "heading2";
      continue;
    }
    if (block._ === "pageBlockList") {
      for (const item of block.items as Record<string, any>[]) {
        line(richSegments(item.text), "• ");
      }
      previous = "list";
      continue;
    }
    if (block._ === "pageBlockParagraph") {
      const segments = richSegments(block.text);
      const plain = segments.map((segment) => segment.text).join("");
      if (!plain) continue;
      if (plain.startsWith("#")) {
        line(segments);
      } else {
        if (previous !== "paragraph") blank();
        line(segments);
      }
      previous = "paragraph";
    }
  }

  return archivePost({
    chatId: message.chatId,
    entities,
    id: message.id,
    mediaType,
    sentAt: message.sentAt,
    text: text.trimEnd(),
  });
};
