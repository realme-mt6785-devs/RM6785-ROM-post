import { describe, expect, test } from "bun:test";

import type { Post, Problem } from "../src/types";

import kernelExample from "../examples/kernel.json";
import recoveryExample from "../examples/recovery.json";
import romExample from "../examples/rom.json";
import { checkRules } from "../src/rules";

const clone = (example: unknown) =>
  structuredClone(example) as Record<string, any>;

const blocking = (problems: Problem[]) =>
  problems.filter((problem) => !problem.warning);

const about = (problems: Problem[], where: string) =>
  problems.filter((problem) => problem.where === where);

describe("the examples raise nothing blocking", () => {
  test.each([
    ["rom", romExample],
    ["recovery", recoveryExample],
    ["kernel", kernelExample],
  ])("%s", (_name, example) => {
    expect(blocking(checkRules(example as Post))).toEqual([]);
  });
});

describe("fields belonging to another kind of post", () => {
  test("a kernel with an Android version", () => {
    const post = clone(kernelExample);
    post.androidVersion = "16";

    const problems = about(checkRules(post as Post), "androidVersion");
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toBe(
      "is not part of a kernel post — remove it",
    );
  });

  test("a kernel with screenshots", () => {
    const post = clone(kernelExample);
    post.links.screenshots = "https://t.me/example/3";

    expect(about(checkRules(post as Post), "links.screenshots")).toHaveLength(
      1,
    );
  });

  test("a kernel with a release type", () => {
    const post = clone(kernelExample);
    post.releaseType = "OFFICIAL";

    expect(about(checkRules(post as Post), "releaseType")).toHaveLength(1);
  });

  test("a recovery with an Android version", () => {
    const post = clone(recoveryExample);
    post.androidVersion = "15";

    expect(about(checkRules(post as Post), "androidVersion")).toHaveLength(1);
  });

  test("a recovery with a build type", () => {
    const post = clone(recoveryExample);
    post.download.buildType = "Vanilla";

    expect(about(checkRules(post as Post), "download.buildType")).toHaveLength(
      1,
    );
  });

  test("a ROM with a kernel version", () => {
    const post = clone(romExample);
    post.kernelVersion = "4.14.336";

    expect(about(checkRules(post as Post), "kernelVersion")).toHaveLength(1);
  });
});

describe("build dates", () => {
  test("tomorrow is refused", () => {
    const post = clone(romExample);
    post.buildDate = new Date(Date.now() + 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const problems = about(checkRules(post as Post), "buildDate");
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toBe("is in the future");
    expect(problems[0].warning).toBeUndefined();
  });

  test("a very old date is only a warning", () => {
    const post = clone(romExample);
    post.buildDate = "2019-01-01";

    const problems = about(checkRules(post as Post), "buildDate");
    expect(problems).toHaveLength(1);
    expect(problems[0].warning).toBe(true);
  });

  test("a date that does not exist", () => {
    const post = clone(romExample);
    post.buildDate = "2026-02-31";

    expect(about(checkRules(post as Post), "buildDate")).toHaveLength(1);
  });
});

describe("bullets", () => {
  test("a bullet character the post would double up on", () => {
    const post = clone(romExample);
    post.changelog = ["• already bulleted", "- also bulleted", "fine"];

    expect(about(checkRules(post as Post), "changelog[0]")).toHaveLength(1);
    expect(about(checkRules(post as Post), "changelog[1]")).toHaveLength(1);
    expect(about(checkRules(post as Post), "changelog[2]")).toHaveLength(0);
  });

  test("repeating the last hashtag warns but does not block", () => {
    const post = clone(romExample);
    post.notes = ["Requires RUI3 firmware"];

    const problems = about(checkRules(post as Post), "notes[0]");
    expect(problems).toHaveLength(1);
    expect(problems[0].warning).toBe(true);
    expect(problems[0].message).toContain("linter");
  });

  test("an http inline link is refused", () => {
    const post = clone(romExample);
    post.author = "[Builder](http://example.com/builder)";

    const problems = about(checkRules(post as Post), "author");
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("https://");
  });
});

describe("length", () => {
  test("a post too long for a photo caption is refused", () => {
    const post = clone(romExample);
    post.changelog = Array.from({ length: 20 }, (_, index) =>
      `Change number ${index} with plenty of detail to pad this out nicely`.repeat(
        2,
      ),
    );

    const problems = blocking(checkRules(post as Post));
    expect(problems).toHaveLength(1);
    expect(problems[0].where).toBe("");
    expect(problems[0].message).toContain("1024");
    expect(problems[0].message).toContain("shorten the changelog");
  });

  test("a post that just fits is accepted", () => {
    expect(blocking(checkRules(romExample as Post))).toEqual([]);
  });
});
