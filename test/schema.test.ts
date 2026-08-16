import { describe, expect, test } from "bun:test";

import kernelExample from "../examples/kernel.json";
import recoveryExample from "../examples/recovery.json";
import romExample from "../examples/rom.json";
import { checkSchema } from "../src/schema";

const rom = () => structuredClone(romExample) as Record<string, any>;

const at = (where: string) => (problems: { where: string }[]) =>
  problems.some((problem) => problem.where === where);

describe("the examples are valid", () => {
  test.each([
    ["rom", romExample],
    ["recovery", recoveryExample],
    ["kernel", kernelExample],
  ])("%s", (_name, example) => {
    expect(checkSchema(example)).toEqual([]);
  });
});

describe("missing fields are named", () => {
  test("a dropped top-level field", () => {
    const post = rom();
    delete post.buildDate;

    const problems = checkSchema(post);
    expect(at("buildDate")(problems)).toBe(true);
    expect(problems[0].message).toContain("required");
  });

  test("the hashtag name is required separately from the displayed name", () => {
    const post = rom();
    delete post.tag;

    expect(at("tag")(checkSchema(post))).toBe(true);
  });

  test("a dropped nested field", () => {
    const post = rom();
    delete post.download.url;

    expect(at("download.url")(checkSchema(post))).toBe(true);
  });

  test("a ROM without an Android version", () => {
    const post = rom();
    delete post.androidVersion;

    expect(at("androidVersion")(checkSchema(post))).toBe(true);
  });

  test("a ROM without a build type", () => {
    const post = rom();
    delete post.download.buildType;

    expect(at("download.buildType")(checkSchema(post))).toBe(true);
  });

  test("a ROM or recovery without screenshots", () => {
    const post = rom();
    delete post.links.screenshots;

    expect(at("links.screenshots")(checkSchema(post))).toBe(true);
  });

  test("a kernel without a kernel version", () => {
    const post = structuredClone(kernelExample) as Record<string, any>;
    delete post.kernelVersion;

    expect(at("kernelVersion")(checkSchema(post))).toBe(true);
  });

  test("a kernel needs neither release type nor screenshots", () => {
    expect(checkSchema(kernelExample)).toEqual([]);
  });
});

describe("malformed values are explained", () => {
  test("a typo'd key is not silently ignored", () => {
    const post = rom();
    post.androidVerison = "16";

    const problems = checkSchema(post);
    expect(at("androidVerison")(problems)).toBe(true);
    expect(problems[0].message).toContain("spelling");
  });

  test("a non-https link", () => {
    const post = rom();
    post.download.url = "http://example.com/build.zip";

    expect(at("download.url")(checkSchema(post))).toBe(true);
  });

  test("a date in the wrong order", () => {
    const post = rom();
    post.buildDate = "17-08-2026";

    const problems = checkSchema(post);
    expect(at("buildDate")(problems)).toBe(true);
    expect(problems[0].message).toContain("ISO date");
  });

  test("a day that does not exist in that month", () => {
    const post = rom();
    post.buildDate = "2026-02-31";

    expect(at("buildDate")(checkSchema(post))).toBe(true);
  });

  test("an unsupported Android version", () => {
    const post = rom();
    post.androidVersion = "9";

    expect(at("androidVersion")(checkSchema(post))).toBe(true);
  });

  test("a file size with no unit", () => {
    const post = rom();
    post.download.fileSize = "1500";

    expect(at("download.fileSize")(checkSchema(post))).toBe(true);
  });

  test("GApps and Vanilla sizes may share one line", () => {
    const post = rom();
    post.download.fileSize = "2.0GB | 1.6GB";

    expect(checkSchema(post)).toEqual([]);
  });

  test("notes remain optional", () => {
    const post = rom();
    delete post.notes;

    expect(checkSchema(post)).toEqual([]);
  });

  test("a stability that is not one of the three", () => {
    const post = rom();
    post.stability = "NIGHTLY";

    const problems = checkSchema(post);
    expect(at("stability")(problems)).toBe(true);
    expect(problems[0].message).toContain("`STABLE`");
  });

  test("an unknown device", () => {
    const post = rom();
    post.device = "RMX2020";

    expect(at("device")(checkSchema(post))).toBe(true);
  });

  test("a multi-line bullet", () => {
    const post = rom();
    post.changelog = ["first line\nsecond line"];

    expect(at("changelog[0]")(checkSchema(post))).toBe(true);
  });

  test("an empty changelog", () => {
    const post = rom();
    post.changelog = [];

    const problems = checkSchema(post);
    expect(at("changelog")(problems)).toBe(true);
    expect(problems[0].message).toContain("at least one");
  });

  test("a RealmeUI version out of range", () => {
    const post = rom();
    post.ruiVersion = 4;

    const problems = checkSchema(post);
    expect(at("ruiVersion")(problems)).toBe(true);
    expect(problems[0].message).toContain("at most 3");
  });

  test("a tag with a space in it", () => {
    const post = rom();
    post.tag = "Lineage OS";

    expect(at("tag")(checkSchema(post))).toBe(true);
  });
});
