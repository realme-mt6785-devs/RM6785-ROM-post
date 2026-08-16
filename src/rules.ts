import type { Post, PostType, Problem } from "./types";

import { CAPTION_LIMIT, POST_STYLE, RICH_SOFT_LIMIT } from "./config";
import { hashtags } from "./fields";
import { inlineSegments, visibleText } from "./inline";
import { renderClassic, renderRich } from "./render";

/** Fields that only make sense for some kinds of post. */
const ONLY_FOR: {
  where: string;
  kinds: PostType[];
  of: (post: Post) => unknown;
}[] = [
  {
    where: "releaseType",
    kinds: ["rom", "recovery"],
    of: (p) => p.releaseType,
  },
  { where: "androidVersion", kinds: ["rom"], of: (p) => p.androidVersion },
  { where: "kernelVersion", kinds: ["kernel"], of: (p) => p.kernelVersion },
  {
    where: "download.buildType",
    kinds: ["rom"],
    of: (p) => p.download.buildType,
  },
  {
    where: "links.screenshots",
    kinds: ["rom", "recovery"],
    of: (p) => p.links.screenshots,
  },
];

const KIND_NAME: Record<PostType, string> = {
  rom: "ROM",
  recovery: "recovery",
  kernel: "kernel",
};

const bulletFields = (post: Post): [string, string[]][] => [
  ["changelog", post.changelog],
  ["bugs", post.bugs],
  ["notes", post.notes ?? []],
];

const inlineFields = (post: Post): [string, string][] => [
  ["author", post.author],
  ...bulletFields(post).flatMap(([field, values]) =>
    values.map((value, index): [string, string] => [
      `${field}[${index}]`,
      value,
    ]),
  ),
];

/**
 * Everything the schema cannot say, or cannot say clearly. Pure and offline, so
 * the tests can cover it; the banner is checked separately in banner.ts.
 */
export const checkRules = (post: Post): Problem[] => {
  const problems: Problem[] = [];

  for (const [field, value] of inlineFields(post)) {
    for (const segment of inlineSegments(value)) {
      if (segment.url && !segment.url.startsWith("https://")) {
        problems.push({
          where: field,
          message: "contains a link that does not start with https://",
        });
      }
    }
  }

  for (const field of ONLY_FOR) {
    if (field.of(post) !== undefined && !field.kinds.includes(post.postType)) {
      problems.push({
        where: field.where,
        message: `is not part of a ${KIND_NAME[post.postType]} post — remove it`,
      });
    }
  }

  const built = new Date(`${post.buildDate}T00:00:00Z`);
  // Date rolls impossible days over rather than rejecting them — 2026-02-31
  // parses as 3 March — so compare the round trip instead of just checking NaN.
  const real =
    !Number.isNaN(built.getTime()) &&
    built.toISOString().slice(0, 10) === post.buildDate;

  if (!real) {
    problems.push({ where: "buildDate", message: "is not a real date" });
  } else {
    const days = (built.getTime() - Date.now()) / 86_400_000;
    if (days > 1) {
      problems.push({ where: "buildDate", message: "is in the future" });
    } else if (days < -365) {
      problems.push({
        where: "buildDate",
        message: "is more than a year old — is that right?",
        warning: true,
      });
    }
  }

  for (const [field, bullets] of bulletFields(post)) {
    bullets.forEach((bullet, index) => {
      if (/^\s*[•\-*]\s/.test(visibleText(bullet))) {
        problems.push({
          where: `${field}[${index}]`,
          message:
            "should not start with a bullet — the post adds those for you",
        });
      }
    });
  }

  // The bot's linter locates the title by searching backwards for the last
  // hashtag, so a bullet repeating it makes an otherwise fine post fail /lint.
  const lastTag = hashtags(post).at(-1) ?? "";
  for (const [field, bullets] of bulletFields(post)) {
    bullets.forEach((bullet, index) => {
      if (lastTag && visibleText(bullet).includes(lastTag)) {
        problems.push({
          where: `${field}[${index}]`,
          message: `repeats "${lastTag}", which confuses the channel's own linter — reword it if you can`,
          warning: true,
        });
      }
    });
  }

  const { caption } = renderClassic(post);
  if (POST_STYLE === "classic" && caption.length > CAPTION_LIMIT) {
    problems.push({
      where: "",
      message: `the finished post is ${caption.length} characters, but Telegram only allows ${CAPTION_LIMIT} under a photo — shorten the changelog`,
    });
  }

  if (POST_STYLE === "rich" && renderRich(post).length > RICH_SOFT_LIMIT) {
    problems.push({
      where: "",
      message: `the finished post is very long (${renderRich(post).length} characters) and Telegram may refuse it`,
      warning: true,
    });
  }

  if (POST_STYLE === "rich" && caption.length > CAPTION_LIMIT) {
    problems.push({
      where: "",
      message: `this post is ${caption.length} characters, so it could not be sent as a photo caption if the channel switches back to that style`,
      warning: true,
    });
  }

  return problems;
};
