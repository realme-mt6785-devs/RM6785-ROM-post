import { describe, expect, test } from "bun:test";

import type { Post } from "../src/types";

import kernelExample from "../examples/kernel.json";
import recoveryExample from "../examples/recovery.json";
import romExample from "../examples/rom.json";
import { renderClassic, renderRich } from "../src/render";
import lintTelegramPost from "./vendor/lintUtils";

const EXAMPLES: [string, Post][] = [
  ["rom", romExample as Post],
  ["recovery", recoveryExample as Post],
  ["kernel", kernelExample as Post],
];

describe("classic rendering", () => {
  test("a ROM post comes out exactly as the channel expects", () => {
    expect(renderClassic(romExample as Post).caption).toBe(
      `#LineageOS #ROM #OFFICIAL #RM6785 #A16 #RUI3

LineageOS 23 for Realme 6/6i(Indian)/6s/7/Narzo/Narzo 20 Pro/Narzo 30 4G [STABLE]
• Author: @yourhandle
• Android version: 16
• Build date: 17-08-2026

Changelog
• Initial official build for Android 16
• August 2026 security patches
• Fixed VoLTE on Indian variants

Bugs
• Video recording in third-party camera apps

Notes
• Clean flash if you are coming from Android 15
• Firmware must be RUI 3

Downloads
• Build type: Vanilla
• File size: 1.5 GB
• Download

Sources
Screenshots
Support group`,
    );
  });

  test("a recovery post omits the Android version and the build type", () => {
    expect(renderClassic(recoveryExample as Post).caption).toBe(
      `#PBRP #RECOVERY #OFFICIAL #RM6785 #RUI2

Pitch Black Recovery Project v4.0 for Realme 6/6i(Indian)/6s/7/Narzo/Narzo 20 Pro/Narzo 30 4G [STABLE]
• Author: Hakimi & Ansh
• Build date: 10-08-2026

Changelog
• Fixed decryption for AOSP ROMs with Android 12.1 and higher.

Bugs
• Flashlight

Notes
• Official
• For realme UI 2.0-based ROMs
• F2FS and EROFS supported

Downloads
• File size: 69MB
• Download

Sources
Screenshots
Support group`,
    );
  });

  test("a kernel post has no release type, no Android version and no screenshots", () => {
    expect(renderClassic(kernelExample as Post).caption).toBe(
      `#NexusKernel #KERNEL #salaa #RUI3

Nexus Kernel v2.1 for Realme 7/Narzo 20 Pro/Narzo 30 4G ONLY [BETA]
• Author: @yourhandle
• Kernel version: 4.14.336
• Build date: 15-08-2026

Changelog
• Linux 4.14.336
• Reworked GPU governor defaults

Bugs
• None known

Downloads
• File size: 24 MB
• Download

Sources
Support group`,
    );
  });

  test.each(EXAMPLES)("%s: entities land on the right text", (_name, post) => {
    const { caption, entities } = renderClassic(post);
    const textOf = (entity: (typeof entities)[number]) =>
      caption.slice(entity.offset, entity.offset + entity.length);

    const bold = entities
      .filter((entity) => entity.type === "bold")
      .map(textOf);
    expect(bold[0]).toContain(" for Realme ");
    expect(bold.slice(1)).toEqual(
      expect.arrayContaining(["Changelog", "Bugs", "Downloads"]),
    );

    const links = entities.filter((entity) => entity.type === "text_link");
    expect(links.map(textOf)).toEqual(
      expect.arrayContaining(["Download", "Sources", "Support group"]),
    );

    // every link points somewhere, and nothing overruns the caption
    for (const entity of entities) {
      expect(entity.offset + entity.length).toBeLessThanOrEqual(caption.length);
      if (entity.type === "text_link")
        expect(entity.url).toMatch(/^https:\/\//);
    }
  });
});

/**
 * The point of the whole exercise: whatever we generate has to satisfy the linter
 * that guards the channel. If this fails, the schema has drifted from the format.
 */
describe("the channel's own linter accepts what we generate", () => {
  test.each(EXAMPLES)("%s", (_name, post) => {
    const { caption, entities } = renderClassic(post);
    const [report, passed] = lintTelegramPost(caption, entities);

    expect(report).toBe("# Seems good 🤌\nBot approves");
    expect(passed).toBe(true);
  });
});

describe("rich rendering", () => {
  test("keeps the banner, headings and footer links", () => {
    const markdown = renderRich(romExample as Post);

    expect(markdown.split("\n")[0]).toBe(
      '![](https://example.com/lineageos-23.png "LineageOS 23")',
    );
    expect(markdown).toContain(
      "# LineageOS 23 for Realme 6/6i(Indian)/6s/7/Narzo/Narzo 20 Pro/Narzo 30 4G [STABLE]",
    );
    expect(markdown).toContain("## Changelog");
    expect(markdown).toContain("- Author: @yourhandle");
    expect(markdown).toContain(
      '<sub><a href="https://t.me/example">Support group</a></sub>',
    );
    expect(markdown).not.toContain("• ");
  });

  test("a kernel post has no screenshots link", () => {
    expect(renderRich(kernelExample as Post)).not.toContain("Screenshots");
  });
});
