import { describe, expect, test } from "bun:test";

import {
  approvalDelayMinutes,
  extractJson,
  isApprovalLabel,
  MAX_DELAY_MINUTES,
} from "../src/issue";

describe("finding the JSON in an issue body", () => {
  test("the shape the issue form produces", () => {
    const body = [
      "### Build JSON",
      "",
      "```json",
      '{"postType": "rom"}',
      "```",
      "",
      "### Before you submit",
      "",
      "- [X] The download link works",
    ].join("\n");

    expect(extractJson(body)).toBe('{"postType": "rom"}');
  });

  test("a fence with no language", () => {
    expect(extractJson('```\n{"postType": "kernel"}\n```')).toBe(
      '{"postType": "kernel"}',
    );
  });

  test("pasted bare, with no fence at all", () => {
    expect(extractJson('  {"postType": "rom"}  ')).toBe('{"postType": "rom"}');
  });

  test("skips a fence that is not the JSON", () => {
    const body = [
      "Here is my build command:",
      "```bash",
      "make bacon",
      "```",
      "and the post:",
      "```json",
      '{"postType": "rom"}',
      "```",
    ].join("\n");

    expect(extractJson(body)).toBe('{"postType": "rom"}');
  });

  test("keeps the JSON intact across lines", () => {
    const json = '{\n  "postType": "rom",\n  "name": "LineageOS"\n}';

    expect(extractJson("### Build JSON\n\n```json\n" + json + "\n```")).toBe(
      json,
    );
  });

  test("nothing to find", () => {
    expect(extractJson("I would like to post my ROM please")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("approval labels", () => {
  test("plain and delayed forms both count", () => {
    expect(isApprovalLabel("approved")).toBe(true);
    expect(isApprovalLabel("approved:5m")).toBe(true);
  });

  test("other labels do not", () => {
    expect(isApprovalLabel("post")).toBe(false);
    expect(isApprovalLabel("lint:pass")).toBe(false);
    expect(isApprovalLabel("posted")).toBe(false);
    expect(isApprovalLabel("not-approved")).toBe(false);
  });
});

describe("how long to wait before posting", () => {
  test("a plain approval posts straight away", () => {
    expect(approvalDelayMinutes("approved")).toBe(0);
  });

  test("a delay is honoured", () => {
    expect(approvalDelayMinutes("approved:5m")).toBe(5);
    expect(approvalDelayMinutes("approved:1m")).toBe(1);
  });

  test("an unreasonable delay is capped rather than refused", () => {
    expect(approvalDelayMinutes("approved:600m")).toBe(MAX_DELAY_MINUTES);
  });

  test("nonsense posts straight away instead of failing", () => {
    expect(approvalDelayMinutes("approved:soon")).toBe(0);
    expect(approvalDelayMinutes("approved:0m")).toBe(0);
    expect(approvalDelayMinutes("approved:5")).toBe(0);
    expect(approvalDelayMinutes("approved:-5m")).toBe(0);
    expect(approvalDelayMinutes(undefined)).toBe(0);
  });
});
