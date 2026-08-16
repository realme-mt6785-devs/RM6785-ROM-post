import type { Post, Problem } from "./types";

import { POST_STYLE } from "./config";
import { buildLayout } from "./layout";
import { renderClassic, renderRich } from "./render";

const list = (problems: Problem[]): string =>
  problems
    .map((problem) =>
      problem.where
        ? `- \`${problem.where}\` ${problem.message}`
        : `- ${problem.message}`,
    )
    .join("\n");

const warningBlock = (problems: Problem[]): string =>
  problems.length ? `\n\n**Worth a look**\n\n${list(problems)}` : "";

const linkLine = (post: Post): string => {
  const layout = buildLayout(post);
  const links = [
    { label: "Download", url: post.download.url },
    ...layout.footer,
  ].map(({ label, url }) => `[${label}](${url})`);

  return links.join(" · ");
};

export const failure = (problems: Problem[], warn: Problem[]): string =>
  `### Not ready yet

${list(problems)}

Edit the issue to fix these and I will check it again.${warningBlock(warn)}`;

export const success = (
  post: Post,
  warn: Problem[],
  record: string,
): string => {
  const preview =
    POST_STYLE === "rich" ? renderRich(post) : renderClassic(post).caption;

  return `### Ready to post

![banner](${post.banner})

<details open>
<summary>How it will look (${POST_STYLE} style)</summary>

\`\`\`
${preview}
\`\`\`

</details>

Links to check: ${linkLine(post)}

Filed as \`${record}\` once it goes out.${warningBlock(warn)}

---

Maintainers: add **\`approved\`** to post it now, or **\`approved:5m\`** to put it out in five minutes.`;
};

export const rejected = (problems: Problem[]): string =>
  `### Not posted

The JSON does not pass the checks any more, so nothing was sent:

${list(problems)}

I have taken the approval label off. Fix the issue and get it approved again.`;

export const posted = (post: Post, link: string, record: string): string =>
  `### Posted

[See it in the channel](${link}) — recorded as \`${record}\`.

Thanks for building ${post.name} ${post.version}.`;

export const alreadyPosted = (link: string | null): string =>
  `### Already posted

This issue has been published once already, so nothing was sent again.${
    link ? ` The original is [here](${link}).` : ""
  }`;
