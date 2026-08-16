import { describe, expect, test } from "bun:test";

import type { Post } from "../src/types";

import romExample from "../examples/rom.json";
import { blockers, inspect, warnings } from "../src/inspect";
import { failure, success } from "../src/report";

const issueBody = (json: unknown): string =>
  ["### Build JSON", "", "```json", JSON.stringify(json, null, 2), "```"].join(
    "\n",
  );

describe("what a contributor sees", () => {
  test("a good post gets a preview, the banner and the filing path", async () => {
    const { post, problems } = await inspect(issueBody(romExample), {
      probeBanner: false,
    });

    expect(post).not.toBeNull();
    expect(blockers(problems)).toEqual([]);

    const comment = success(
      post as Post,
      warnings(problems),
      "LineageOS/A16/x.json",
    );

    expect(comment).toContain("Ready to post");
    expect(comment).toContain(
      "![banner](https://example.com/lineageos-23.png)",
    );
    expect(comment).toContain("#LineageOS #ROM #OFFICIAL #RM6785 #A16 #RUI3");
    expect(comment).toContain("• Author: @yourhandle");
    expect(comment).toContain("`LineageOS/A16/x.json`");
    expect(comment).toContain("`approved`");
    expect(comment).toContain("`approved:5m`");

    // the links an admin should click before approving
    expect(comment).toContain(
      "[Download](https://example.com/lineage-23.0-20260817-nightly-RM6785-signed.zip)",
    );
    expect(comment).toContain("[Sources](https://github.com/LineageOS)");
  });

  test("a broken post names each field", async () => {
    const broken = {
      ...structuredClone(romExample),
      stability: "NIGHTLY",
    } as Record<string, unknown>;
    delete broken.author;

    const { post, problems } = await inspect(issueBody(broken), {
      probeBanner: false,
    });

    expect(post).toBeNull();

    const comment = failure(blockers(problems), warnings(problems));

    expect(comment).toContain("Not ready yet");
    expect(comment).toContain("`author`");
    expect(comment).toContain("`stability`");
    expect(comment).toContain("check it again");
  });

  test("warnings appear without blocking", async () => {
    const nagging = structuredClone(romExample) as Record<string, any>;
    nagging.notes = ["Needs RUI3 firmware"];

    const { post, problems } = await inspect(issueBody(nagging), {
      probeBanner: false,
    });

    expect(post).not.toBeNull();
    expect(blockers(problems)).toEqual([]);
    expect(warnings(problems)).toHaveLength(1);

    expect(success(post as Post, warnings(problems), "x.json")).toContain(
      "Worth a look",
    );
  });

  test("something that is not JSON at all", async () => {
    const { post, problems } = await inspect("please post my rom, thanks");

    expect(post).toBeNull();
    expect(failure(blockers(problems), [])).toContain(
      "could not find a JSON object",
    );
  });

  test("JSON with a syntax error", async () => {
    const { post, problems } = await inspect(
      '```json\n{"postType": "rom",}\n```',
    );

    expect(post).toBeNull();
    expect(failure(blockers(problems), [])).toContain("could not be parsed");
  });

  test("a missing postType is reported on its own", async () => {
    const post = structuredClone(romExample) as Record<string, unknown>;
    delete post.postType;

    const { problems } = await inspect(issueBody(post), { probeBanner: false });

    expect(problems).toHaveLength(1);
    expect(problems[0].where).toBe("postType");
  });
});
