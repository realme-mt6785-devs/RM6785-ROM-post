import type { MessageEntity } from "node-telegram-bot-api";

import type { Link } from "./layout";
import type { Post } from "./types";

import { shortTitle } from "./fields";
import { inlineSegments } from "./inline";
import { buildLayout } from "./layout";

export interface ClassicPost {
  caption: string;
  entities: MessageEntity[];
}

/**
 * Builds plain text while recording where the bold runs and links fall. Telegram
 * wants entity offsets in UTF-16 code units, which is exactly what String#length
 * counts, so appending and reading .length is all it takes.
 *
 * Emitting entities rather than HTML also means nothing has to be escaped — an
 * author called "Hakimi & Ansh" or a changelog mentioning <flags> comes out
 * verbatim.
 */
class Caption {
  private text = "";
  private readonly entities: MessageEntity[] = [];

  plain(value: string): this {
    this.text += value;
    return this;
  }

  bold(value: string): this {
    this.entities.push({
      type: "bold",
      offset: this.text.length,
      length: value.length,
    });
    return this.plain(value);
  }

  link({ label, url }: Link): this {
    this.entities.push({
      type: "text_link",
      offset: this.text.length,
      length: label.length,
      url,
    });
    return this.plain(label);
  }

  inline(value: string): this {
    for (const segment of inlineSegments(value)) {
      if (segment.url) this.link({ label: segment.text, url: segment.url });
      else this.plain(segment.text);
    }
    return this;
  }

  done(): ClassicPost {
    return { caption: this.text, entities: this.entities };
  }
}

/** A photo with a caption — what the channel uses, and what every client renders. */
export const renderClassic = (post: Post): ClassicPost => {
  const layout = buildLayout(post);
  const out = new Caption();

  out.plain(layout.hashtags.map((tag) => `#${tag}`).join(" "));

  // exactly two newlines before the title, which the linter checks for
  out.plain("\n\n").bold(layout.title);

  for (const line of layout.info) out.plain("\n• ").inline(line);

  for (const section of layout.sections) {
    out.plain("\n\n").bold(section.heading);

    for (const bullet of section.bullets) {
      out.plain("\n• ");
      if (typeof bullet === "string") out.inline(bullet);
      else out.link(bullet);
    }
  }

  out.plain("\n\n");
  layout.footer.forEach((link, index) => {
    if (index > 0) out.plain("\n");
    out.link(link);
  });

  return out.done();
};

const anchor = ({ label, url }: Link): string =>
  `<a href="${url}">${label}</a>`;

const richInline = (value: string): string =>
  inlineSegments(value)
    .map((segment) =>
      segment.url
        ? anchor({ label: segment.text, url: segment.url })
        : segment.text,
    )
    .join("");

/**
 * Telegram's rich message format. Shaped to match what the bot's
 * parsePostAndConstructRichMarkdown produced during the channel's rich
 * experiment, so switching styles does not change the layout readers saw.
 */
export const renderRich = (post: Post): string => {
  const layout = buildLayout(post);
  const lines: string[] = [
    `![](${post.banner} "${shortTitle(post).replaceAll('"', "'")}")`,
    layout.hashtags.map((tag) => `#${tag}`).join(" "),
    "",
    `# ${layout.title}`,
    "",
    ...layout.info.map((line) => `- ${richInline(line)}`),
  ];

  for (const section of layout.sections) {
    lines.push("", `## ${section.heading}`, "");

    for (const bullet of section.bullets) {
      lines.push(
        typeof bullet === "string"
          ? `- ${richInline(bullet)}`
          : `- ${anchor(bullet)}`,
      );
    }
  }

  lines.push("");
  for (const link of layout.footer) lines.push(`<sub>${anchor(link)}</sub>`);

  return lines.join("\n");
};
