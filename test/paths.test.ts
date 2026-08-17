import { describe, expect, test } from "bun:test";

import type { Post } from "../src/types";

import kernelExample from "../examples/kernel.json";
import recoveryExample from "../examples/recovery.json";
import romExample from "../examples/rom.json";
import {
  contentSuffix,
  issueSuffix,
  messageSuffix,
  recordPath,
} from "../src/paths";

describe("where a record is filed", () => {
  test("a ROM sorts by Android version", () => {
    expect(recordPath(romExample as Post, issueSuffix(142))).toBe(
      "LineageOS/A16/LineageOS-RM6785-2026-08-17-i142.json",
    );
  });

  test("a recovery sorts by RealmeUI version, and uses its short tag", () => {
    expect(recordPath(recoveryExample as Post, issueSuffix(37))).toBe(
      "PBRP/RUI2/PBRP-RM6785-2026-08-10-i37.json",
    );
  });

  test("a kernel sorts by RealmeUI version", () => {
    expect(recordPath(kernelExample as Post, issueSuffix(8))).toBe(
      "NexusKernel/RUI3/NexusKernel-salaa-2026-08-15-i8.json",
    );
  });

  test("the tag, rather than the displayed name, determines the folder", () => {
    const post = {
      ...(romExample as Post),
      name: "Project Elixir 5.0",
      tag: "ProjectElixir",
    };

    expect(recordPath(post, issueSuffix(1))).toBe(
      "ProjectElixir/A16/ProjectElixir-RM6785-2026-08-17-i1.json",
    );
  });

  test("the same build on the same day for two devices does not collide", () => {
    const one = recordPath(
      { ...(romExample as Post), device: "RM6785" },
      issueSuffix(5),
    );
    const two = recordPath(
      { ...(romExample as Post), device: "nemo" },
      issueSuffix(5),
    );

    expect(one).not.toBe(two);
  });

  test("an Android version with detail still folders by its major", () => {
    const post = { ...(romExample as Post), androidVersion: "16 QPR1" };

    expect(recordPath(post, issueSuffix(1))).toContain("/A16/");
  });
});

describe("suffixes", () => {
  test("the issue number identifies the thread it was approved in", () => {
    expect(issueSuffix(142)).toBe("i142");
  });

  test("content hashing is stable and short", () => {
    expect(contentSuffix('{"a":1}')).toBe(contentSuffix('{"a":1}'));
    expect(contentSuffix('{"a":1}')).toMatch(/^h[0-9a-f]{4}$/);
    expect(contentSuffix('{"a":1}')).not.toBe(contentSuffix('{"a":2}'));
  });

  test("an imported record points back to its channel message", () => {
    expect(messageSuffix(1234)).toBe("m1234");
  });
});
