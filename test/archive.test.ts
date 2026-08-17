import { describe, expect, test } from "bun:test";

import type { ArchiveEntity, ArchiveMessage } from "../src/archive";
import type { Post } from "../src/types";

import kernelExample from "../examples/kernel.json";
import recoveryExample from "../examples/recovery.json";
import romExample from "../examples/rom.json";
import { archivePost, archiveRichPost } from "../src/archive";
import { renderClassic } from "../src/render";
import { checkSchema } from "../src/schema";

const classicMessage = (post: Post): ArchiveMessage => {
  const rendered = renderClassic(post);
  const entities: ArchiveEntity[] = rendered.entities.map((entity) => ({
    kind: entity.type,
    length: entity.length,
    offset: entity.offset,
    url: entity.type === "text_link" ? entity.url : undefined,
  }));
  return {
    chatId: -1001384382397,
    entities,
    id: 1234,
    mediaType: "photo",
    text: rendered.caption,
  };
};

describe("channel archive parser", () => {
  test.each([
    ["ROM", romExample],
    ["recovery", recoveryExample],
    ["kernel", kernelExample],
  ])("recovers a generated %s post", (_kind, example) => {
    const source = example as Post;
    const result = archivePost(classicMessage(source));

    expect(result.eligible).toBe(true);
    if (!result.eligible) return;

    const expected = structuredClone(source) as Partial<Post>;
    delete expected.$schema;
    delete expected.banner;
    expect(result.post).toEqual({
      ...expected,
      banner: "telegram-message:-1001384382397:1234",
    } as Post);
    expect(result.post.author).toBe(source.author);
  });

  test("does not mistake a media announcement for a build post", () => {
    const result = archivePost({
      chatId: -1001384382397,
      entities: [],
      id: 44,
      mediaType: "photo",
      text: "#Announcement\n\nMaintenance tonight",
    });

    expect(result).toEqual({
      candidate: false,
      eligible: false,
      reason: "not a build post",
    });
  });

  test("reports an incomplete build-looking message instead of guessing", () => {
    const message = classicMessage(romExample as Post);
    message.text = message.text
      .replace(/\n• Build date: .*\n/, "\n")
      .replace("• Download", "• No download supplied");
    message.entities = [];
    const result = archivePost(message);

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.candidate).toBe(true);
    expect(result.reason).toContain("could not be determined");
  });

  test("accepts the internal Telegram banner reference", () => {
    const post = structuredClone(romExample) as Record<string, unknown>;
    post.banner = "telegram-message:-1001384382397:1234";
    expect(checkSchema(post)).toEqual([]);

    delete post.releaseType;
    delete post.androidVersion;
    delete (post.download as Record<string, unknown>).buildType;
    delete (post.download as Record<string, unknown>).fileSize;
    delete (post.links as Record<string, unknown>).screenshots;
    delete (post.links as Record<string, unknown>).supportGroup;
    expect(checkSchema(post)).toEqual([]);

    post.banner = "telegram-message:RM6785:1234";
    expect(
      checkSchema(post).some((problem) => problem.where === "banner"),
    ).toBe(true);
  });

  test("does not turn linked build flavours into schema text", () => {
    const message = classicMessage(romExample as Post);
    const offset = message.text.indexOf("GAPPS | VANILLA");
    message.entities = [
      ...message.entities,
      {
        kind: "text_link",
        length: 5,
        offset,
        url: "https://example.com/gapps.zip",
      },
    ];

    const result = archivePost(message);
    expect(result.eligible).toBe(true);
    if (result.eligible) {
      expect(result.post.download.buildType).toBe("GAPPS | VANILLA");
    }
  });

  test("recovers a rich post but ignores a rich announcement", () => {
    const plain = (text: string) => ({ _: "textPlain", text });
    const rich = archiveRichPost({
      blocks: [
        { _: "pageBlockPhoto" },
        {
          _: "pageBlockParagraph",
          text: plain("#PixelOS #ROM #OFFICIAL #nemo #A16 #RUI2"),
        },
        {
          _: "pageBlockHeading1",
          text: plain(
            "PixelOS 16.2 for Realme 6/6i(Indian)/6s/Narzo ONLY [STABLE]",
          ),
        },
        {
          _: "pageBlockList",
          items: [
            { text: plain("Author: Debayan Kar") },
            { text: plain("Android version: 16.0") },
            { text: plain("Build date: 22-06-2026") },
          ],
        },
        { _: "pageBlockHeading2", text: plain("Changelog") },
        { _: "pageBlockList", items: [{ text: plain("Initial build") }] },
        { _: "pageBlockHeading2", text: plain("Bugs") },
        { _: "pageBlockList", items: [{ text: plain("None known") }] },
        { _: "pageBlockHeading2", text: plain("Downloads") },
        {
          _: "pageBlockList",
          items: [
            { text: plain("Build type: GAPPS") },
            { text: plain("File size: 2.25GB") },
            {
              text: {
                _: "textUrl",
                text: plain("Download"),
                url: "https://example.com/build.zip",
              },
            },
          ],
        },
        {
          _: "pageBlockParagraph",
          text: {
            _: "textUrl",
            text: plain("Sources"),
            url: "https://github.com/example/device",
          },
        },
        {
          _: "pageBlockParagraph",
          text: {
            _: "textUrl",
            text: plain("Screenshots"),
            url: "https://t.me/example/1",
          },
        },
        {
          _: "pageBlockParagraph",
          text: {
            _: "textUrl",
            text: plain("Support group"),
            url: "https://t.me/example",
          },
        },
      ],
      chatId: -1001384382397,
      id: 2563,
    });

    expect(rich.eligible).toBe(true);
    if (rich.eligible) expect(rich.post.name).toBe("PixelOS 16.2");

    expect(
      archiveRichPost({
        blocks: [
          {
            _: "pageBlockHeading1",
            text: plain("How to Post Your ROM in This Channel"),
          },
        ],
        chatId: -1001384382397,
        id: 2559,
      }),
    ).toEqual({
      candidate: false,
      eligible: false,
      reason: "not a build post",
    });
  });
});
