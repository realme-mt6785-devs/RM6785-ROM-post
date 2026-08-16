import type { Post } from "./types";

import { displayDate, hashtags, titleLine } from "./fields";

export interface Link {
  label: string;
  url: string;
}

export type Bullet = Link | string;

export interface Section {
  heading: string;
  bullets: Bullet[];
}

/**
 * A post broken into the pieces every renderer needs, in the order they appear.
 * Everything about *what* belongs in which kind of post lives here, so the
 * renderers only have to decide how it looks.
 */
export interface Layout {
  hashtags: string[];
  title: string;
  info: string[];
  sections: Section[];
  footer: Link[];
}

export const buildLayout = (post: Post): Layout => {
  const info = [`Author: ${post.author}`];
  if (post.postType === "rom") {
    info.push(`Android version: ${post.androidVersion}`);
  }
  if (post.postType === "kernel") {
    info.push(`Kernel version: ${post.kernelVersion}`);
  }
  info.push(`Build date: ${displayDate(post)}`);

  const sections: Section[] = [
    { heading: "Changelog", bullets: post.changelog },
    { heading: "Bugs", bullets: post.bugs },
  ];

  if (post.notes?.length) {
    sections.push({ heading: "Notes", bullets: post.notes });
  }

  const downloads: Bullet[] = [];
  if (post.postType === "rom") {
    downloads.push(`Build type: ${post.download.buildType}`);
  }
  downloads.push(`File size: ${post.download.fileSize}`);
  downloads.push({ label: "Download", url: post.download.url });
  sections.push({ heading: "Downloads", bullets: downloads });

  const footer: Link[] = [{ label: "Sources", url: post.links.sources }];
  if (post.links.screenshots) {
    footer.push({ label: "Screenshots", url: post.links.screenshots });
  }
  footer.push({ label: "Support group", url: post.links.supportGroup });
  if (post.links.donate) {
    footer.push({ label: "Donate", url: post.links.donate });
  }

  return {
    hashtags: hashtags(post),
    title: titleLine(post),
    info,
    sections,
    footer,
  };
};
