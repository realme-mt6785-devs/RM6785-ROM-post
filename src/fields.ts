import type { Post } from "./types";

import { DEVICE_BLURB } from "./devices";

/** Hashtag and folder name. */
export const postTag = (post: Post): string =>
  post.tag ?? post.name.replace(/\W+/g, "");

/** "16 QPR1" -> "16", for the #A16 hashtag and the folder name. */
export const androidMajor = (post: Post): string =>
  post.androidVersion?.match(/^(1[0-7])/)?.[1] ?? "";

/** 2026-08-17 -> 17-08-2026, the only form the bot's linter accepts. */
export const displayDate = (post: Post): string => {
  const [year, month, day] = post.buildDate.split("-");
  return `${day}-${month}-${year}`;
};

/** The part of the title before "for", also used as the banner's caption. */
export const shortTitle = (post: Post): string =>
  `${post.name} ${post.version}`;

export const titleLine = (post: Post): string =>
  `${shortTitle(post)} for ${DEVICE_BLURB[post.device]} [${post.stability}]`;

/** Order matters — the bot's linter reads these positionally. */
export const hashtags = (post: Post): string[] => {
  const tag = postTag(post);
  const rui = `RUI${post.ruiVersion}`;

  if (post.postType === "kernel") return [tag, "KERNEL", post.device, rui];

  if (post.postType === "recovery") {
    return [tag, "RECOVERY", post.releaseType ?? "", post.device, rui];
  }

  return [
    tag,
    "ROM",
    post.releaseType ?? "",
    post.device,
    `A${androidMajor(post)}`,
    rui,
  ];
};
