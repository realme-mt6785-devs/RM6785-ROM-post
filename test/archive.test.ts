import { describe, expect, test } from "bun:test";

import type { ArchiveEntity, ArchiveMessage } from "../src/archive";
import type { Post } from "../src/types";

import kernelExample from "../examples/kernel.json";
import recoveryExample from "../examples/recovery.json";
import romExample from "../examples/rom.json";
import { archivePost } from "../src/archive";
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

  test("reports a malformed build-looking message instead of guessing", () => {
    const message = classicMessage(romExample as Post);
    message.text = message.text.replace("\n\nBugs\n", "\n\nKnown issues\n");
    const result = archivePost(message);

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.candidate).toBe(true);
    expect(result.reason).toContain("required sections");
  });

  test("accepts the internal Telegram banner reference", () => {
    const post = structuredClone(romExample) as Record<string, unknown>;
    post.banner = "telegram-message:-1001384382397:1234";
    expect(checkSchema(post)).toEqual([]);

    post.banner = "telegram-message:RM6785:1234";
    expect(
      checkSchema(post).some((problem) => problem.where === "banner"),
    ).toBe(true);
  });
});
