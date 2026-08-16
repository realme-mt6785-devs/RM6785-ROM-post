import { createHash } from "node:crypto";

import type { Post } from "./types";

import { androidMajor, postTag } from "./fields";

/**
 * Second folder level: the version that best identifies the build. ROMs sort by
 * Android version; recoveries and kernels carry no Android hashtag, so they sort
 * by RealmeUI instead.
 */
export const versionFolder = (post: Post): string =>
  post.postType === "rom" ? `A${androidMajor(post)}` : `RUI${post.ruiVersion}`;

export const recordDir = (post: Post): string =>
  `${postTag(post)}/${versionFolder(post)}`;

/**
 * Distinguishes two builds of the same thing on the same day. An issue number is
 * used rather than random text so a record points back at the thread it was
 * approved in, and so publishing can tell whether it has already run.
 */
export const issueSuffix = (issueNumber: number): string => `i${issueNumber}`;

/** For records that arrive by pull request instead of through an issue. */
export const contentSuffix = (json: string): string =>
  `h${createHash("sha256").update(json).digest("hex").slice(0, 4)}`;

export const recordPath = (post: Post, suffix: string): string =>
  `${recordDir(post)}/${postTag(post)}-${post.device}-${post.buildDate}-${suffix}.json`;
