import type { Device, Post, PostType, ReleaseType, Stability } from "./types";

import { DEVICE_BLURB } from "./devices";
import { checkRules } from "./rules";
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
  text: string;
}

export type ArchiveResult =
  | { eligible: true; post: Post }
  | { candidate: boolean; eligible: false; reason: string };

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
const SECTION_HEADINGS = new Set(["Bugs", "Changelog", "Downloads", "Notes"]);

class NotEligible extends Error {}

const fail = (reason: string): never => {
  throw new NotEligible(reason);
};

const splitLines = (text: string): Line[] => {
  let start = 0;
  return text.split("\n").map((line) => {
    const result = { start, text: line };
    start += line.length + 1;
    return result;
  });
};

const inlineText = (
  value: string,
  start: number,
  entities: readonly ArchiveEntity[],
): string => {
  const links = entities
    .filter(
      (entity) =>
        entity.kind === "text_link" &&
        entity.url &&
        entity.offset >= start &&
        entity.offset + entity.length <= start + value.length,
    )
    .sort((left, right) => left.offset - right.offset);

  if (!links.length) return value;

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

const lineValue = (
  line: Line,
  prefix: string,
  entities: readonly ArchiveEntity[],
): string => {
  if (!line.text.startsWith(prefix)) fail(`missing "${prefix.trim()}" line`);
  const value = line.text.slice(prefix.length).trim();
  if (!value) fail(`empty "${prefix.trim()}" value`);
  const leading = line.text.slice(prefix.length).search(/\S/);
  return inlineText(value, line.start + prefix.length + leading, entities);
};

const linkOnLine = (line: Line, entities: readonly ArchiveEntity[]): string => {
  const prefixLength = line.text.startsWith("• ") ? 2 : 0;
  const labelStart = line.start + prefixLength;
  const labelLength = line.text.length - prefixLength;
  const entity = entities.find(
    (item) =>
      item.kind === "text_link" &&
      item.url &&
      item.offset <= labelStart &&
      item.offset + item.length >= labelStart + labelLength,
  );
  if (!entity || !entity.url)
    throw new NotEligible(`"${line.text}" is not a link`);
  return entity.url;
};

const chooseDevice = (tags: string[]): Device => {
  const devices = tags.filter((tag): tag is Device =>
    DEVICES.has(tag as Device),
  );
  if (
    devices.length !== tags.length ||
    devices.length < 1 ||
    devices.length > 2
  ) {
    fail("device hashtags are ambiguous");
  }

  if (devices.length === 2) {
    const pair = new Set(devices);
    const matchesAlias =
      (pair.has("nemo") && pair.has("RMX2001")) ||
      (pair.has("salaa") && pair.has("RMX2151"));
    if (!matchesAlias) fail("device hashtags disagree");
  }

  return (
    devices.find((device) => device === "nemo" || device === "salaa") ??
    devices[0]
  );
};

const bulletsBetween = (
  lines: Line[],
  headingIndex: number,
  endIndex: number,
  entities: readonly ArchiveEntity[],
): string[] => {
  const bullets = lines
    .slice(headingIndex + 1, endIndex)
    .filter((line) => line.text);
  if (!bullets.length || bullets.some((line) => !line.text.startsWith("• "))) {
    fail(`invalid ${lines[headingIndex].text} section`);
  }

  return bullets.map((line) =>
    inlineText(line.text.slice(2), line.start + 2, entities),
  );
};

const parse = (message: ArchiveMessage, hashtags: string[]): Post => {
  if (!MEDIA_TYPES.has(message.mediaType ?? ""))
    fail("post has no banner media");

  const postType = POST_TYPES[hashtags[1]];
  if (!postType) fail("second hashtag is not a supported post type");

  let releaseType: ReleaseType | undefined;
  let deviceTags: string[];
  let androidVersion: string | undefined;
  let ruiTag: string;

  if (postType === "rom") {
    releaseType = hashtags[2] as ReleaseType;
    if (releaseType !== "OFFICIAL" && releaseType !== "UNOFFICIAL") {
      fail("ROM release hashtag is invalid");
    }
    androidVersion = hashtags.at(-2)?.match(/^A(1[0-7])$/)?.[1];
    if (!androidVersion) fail("ROM Android hashtag is invalid");
    ruiTag = hashtags.at(-1) ?? "";
    deviceTags = hashtags.slice(3, -2);
  } else if (postType === "recovery") {
    releaseType = hashtags[2] as ReleaseType;
    if (releaseType !== "OFFICIAL" && releaseType !== "UNOFFICIAL") {
      fail("recovery release hashtag is invalid");
    }
    ruiTag = hashtags.at(-1) ?? "";
    deviceTags = hashtags.slice(3, -1);
  } else {
    ruiTag = hashtags.at(-1) ?? "";
    deviceTags = hashtags.slice(2, -1);
  }

  const ruiVersion = Number(ruiTag.match(/^RUI([1-3])$/)?.[1]);
  if (!ruiVersion) fail("RealmeUI hashtag is invalid");
  const device = chooseDevice(deviceTags);

  const lines = splitLines(message.text);
  if (lines[0]?.text !== hashtags.map((tag) => `#${tag}`).join(" ")) {
    fail("hashtag line contains unexpected text");
  }
  if (lines[1]?.text !== "" || !lines[2]?.text) {
    fail("title is not separated from hashtags by one blank line");
  }

  const titlePattern = new RegExp(
    `^(.*?) for ${DEVICE_BLURB[device].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\[(STABLE|BETA|ALPHA)\\]$`,
  );
  const title = lines[2].text.match(titlePattern);
  if (!title) throw new NotEligible("title does not match the device hashtag");
  const name = title[1].trim();
  const stability = title[2] as Stability;

  const firstHeading = lines.findIndex(
    (line, index) => index > 2 && line.text === "Changelog",
  );
  if (firstHeading < 0) fail("missing Changelog section");
  const info = lines.slice(3, firstHeading).filter((line) => line.text);
  const expectedInfo = postType === "recovery" ? 2 : 3;
  if (info.length !== expectedInfo)
    fail("build information block is ambiguous");

  const author = lineValue(info[0], "• Author: ", message.entities);
  let kernelVersion: string | undefined;
  if (postType === "rom") {
    const stated = lineValue(info[1], "• Android version: ", message.entities);
    if (!stated.startsWith(androidVersion ?? "")) {
      fail("Android version line disagrees with its hashtag");
    }
    androidVersion = stated;
  } else if (postType === "kernel") {
    kernelVersion = lineValue(info[1], "• Kernel version: ", message.entities);
  }

  const dateLine = info.at(-1) as Line;
  const displayedDate = lineValue(dateLine, "• Build date: ", message.entities);
  const date = displayedDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!date) throw new NotEligible("build date is not DD-MM-YYYY");
  const buildDate = `${date[3]}-${date[2]}-${date[1]}`;

  const headingIndexes = new Map<string, number>();
  lines.forEach((line, index) => {
    if (SECTION_HEADINGS.has(line.text)) headingIndexes.set(line.text, index);
  });
  const changelogIndex = headingIndexes.get("Changelog") ?? -1;
  const bugsIndex = headingIndexes.get("Bugs") ?? -1;
  const notesIndex = headingIndexes.get("Notes");
  const downloadsIndex = headingIndexes.get("Downloads") ?? -1;
  if (
    changelogIndex !== firstHeading ||
    bugsIndex <= changelogIndex ||
    downloadsIndex <= bugsIndex ||
    (notesIndex !== undefined &&
      (notesIndex <= bugsIndex || notesIndex >= downloadsIndex))
  ) {
    fail("required sections are missing or out of order");
  }

  const changelog = bulletsBetween(
    lines,
    changelogIndex,
    bugsIndex,
    message.entities,
  );
  const bugs = bulletsBetween(
    lines,
    bugsIndex,
    notesIndex ?? downloadsIndex,
    message.entities,
  );
  const notes =
    notesIndex === undefined
      ? undefined
      : bulletsBetween(lines, notesIndex, downloadsIndex, message.entities);

  const afterDownloads = lines.findIndex(
    (line, index) => index > downloadsIndex && line.text === "",
  );
  if (afterDownloads < 0) fail("Downloads section has no footer separator");
  const downloadLines = lines
    .slice(downloadsIndex + 1, afterDownloads)
    .filter((line) => line.text);
  const expectedDownloads = postType === "rom" ? 3 : 2;
  if (
    downloadLines.length !== expectedDownloads ||
    downloadLines.some((line) => !line.text.startsWith("• "))
  ) {
    fail("Downloads section is ambiguous");
  }

  let downloadCursor = 0;
  const buildType =
    postType === "rom"
      ? lineValue(
          downloadLines[downloadCursor++],
          "• Build type: ",
          message.entities,
        )
      : undefined;
  const fileSize = lineValue(
    downloadLines[downloadCursor++],
    "• File size: ",
    message.entities,
  );
  const downloadLine = downloadLines[downloadCursor];
  if (downloadLine.text !== "• Download")
    fail("Download link label is invalid");
  const downloadUrl = linkOnLine(downloadLine, message.entities);

  const footer = lines.slice(afterDownloads + 1).filter((line) => line.text);
  const footerLabels = footer.map((line) => line.text);
  const expectedFooter = [
    "Sources",
    ...(postType === "kernel" ? [] : ["Screenshots"]),
    "Support group",
  ];
  if (
    footerLabels.length < expectedFooter.length ||
    !expectedFooter.every((label, index) => footerLabels[index] === label) ||
    (footerLabels.length > expectedFooter.length &&
      !(
        footerLabels.length === expectedFooter.length + 1 &&
        footerLabels.at(-1) === "Donate"
      ))
  ) {
    fail("footer links are missing or out of order");
  }
  const footerLinks = Object.fromEntries(
    footer.map((line) => [line.text, linkOnLine(line, message.entities)]),
  );

  const post: Post = {
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
      sources: footerLinks.Sources,
      screenshots: footerLinks.Screenshots,
      supportGroup: footerLinks["Support group"],
      donate: footerLinks.Donate,
    },
  };

  const problems = [...checkSchema(post), ...checkRules(post)].filter(
    (problem) => !problem.warning,
  );
  if (problems.length) {
    fail(
      problems
        .map((problem) => `${problem.where || "post"}: ${problem.message}`)
        .join("; "),
    );
  }

  return post;
};

export const archivePost = (message: ArchiveMessage): ArchiveResult => {
  const hashtags = message.text
    .match(/^#\w+(?: #\w+)*/)?.[0]
    .split(" ")
    .map((tag) => tag.slice(1));
  const candidate = Boolean(hashtags && POST_TYPES[hashtags[1]]);
  if (!candidate || !hashtags) {
    return { candidate: false, eligible: false, reason: "not a build post" };
  }

  try {
    return { eligible: true, post: parse(message, hashtags) };
  } catch (error) {
    if (error instanceof NotEligible) {
      return { candidate: true, eligible: false, reason: error.message };
    }
    throw error;
  }
};
