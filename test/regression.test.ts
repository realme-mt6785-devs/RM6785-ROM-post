import { describe, expect, test } from "bun:test";

import type { ArchiveMessage } from "../src/archive";

import { archivePost } from "../src/archive";
import messages from "./fixtures/channel-messages.json";

/**
 * Real @RM6785 posts that the parser once got wrong, captured verbatim.
 *
 * archive.test.ts proves the parser can read back what this project's own
 * renderer produces. It cannot catch the formats that predate that renderer —
 * emoji-prefixed labels, banner art, titles that are absent altogether — which
 * is how ten records were archived under names like "New build available" and
 * three under dates in 1969, 2004 and 2014.
 *
 * Refresh the fixture with a read-only history read if a case needs revisiting;
 * the ids below are the message ids in the channel.
 */
const EXPECTED: Record<
  number,
  { buildDate: string; guards: string; name: string }
> = {
  492: {
    name: "SkyHawk",
    buildDate: "2021-01-21",
    guards: "title is on the hashtag line, so only the tag is recoverable",
  },
  695: {
    name: "DerpFest",
    buildDate: "2021-02-14",
    guards: "ISO caption date read day-first slid two characters into 2014",
  },
  897: {
    name: "PitchBlack Recovery",
    buildDate: "2021-04-17",
    guards: "caption date postdates its own post, so the message date wins",
  },
  992: {
    name: "NezukoOS 1.3",
    buildDate: "2021-05-14",
    guards: "title inside banner art; OS suffix needs no leading boundary",
  },
  1078: {
    name: "EvolutionX",
    buildDate: "2021-06-12",
    guards: "no title line at all; Version: Eleven is an Android release",
  },
  1113: {
    name: "BLISS OS",
    buildDate: "2021-06-21",
    guards: "title wrapped in pipes with a device tail",
  },
  1163: {
    name: "EvolutionX",
    buildDate: "2021-07-08",
    guards: "New build available header is not a title",
  },
  1171: {
    name: "ShapeShiftOS",
    buildDate: "2021-07-10",
    guards:
      "caption reads '2021 July 10'; New build available header is not a title",
  },
  1228: {
    name: "EvolutionX",
    buildDate: "2021-08-03",
    guards: "New build available header is not a title",
  },
  1282: {
    name: "ShapeShiftOS",
    buildDate: "2021-08-24",
    guards:
      "caption reads '2021 Aug 24'; New build available header is not a title",
  },
  1323: {
    name: "EvolutionX",
    buildDate: "2021-09-10",
    guards:
      "caption reads '2021 September 10'; New build available header is not a title",
  },
  1384: {
    name: "EvolutionX",
    buildDate: "2021-10-15",
    guards:
      "caption reads '2021 October 15 01:55'; New build available header is not a title",
  },
  2164: {
    name: "SuperiorOS Thirteen",
    buildDate: "2023-11-03",
    guards: "NOT FOR REALME 6 warning sits above the title",
  },
  2359: {
    name: "Matrixx 11.1.0",
    buildDate: "2025-02-06",
    guards: "caption really reads 06-02-1969",
  },
  2616: {
    name: "DerpFest-16.2",
    buildDate: "2026-08-17",
    guards: "control: a current-format post must keep parsing unchanged",
  },
};

const FIXTURES = messages as unknown as ArchiveMessage[];

describe("posts the parser used to mangle", () => {
  test("the fixture covers every expected message", () => {
    expect(FIXTURES.map((message) => message.id).sort((a, b) => a - b)).toEqual(
      Object.keys(EXPECTED)
        .map(Number)
        .sort((a, b) => a - b),
    );
  });

  for (const message of FIXTURES) {
    const expected = EXPECTED[message.id]!;

    test(`m${message.id}: ${expected.guards}`, () => {
      const result = archivePost(message);

      expect(result.eligible).toBe(true);
      if (!result.eligible) return;

      expect(result.post.name).toBe(expected.name);
      expect(result.post.buildDate).toBe(expected.buildDate);
    });
  }

  test("no build is dated after the post announcing it", () => {
    for (const message of FIXTURES) {
      const result = archivePost(message);
      if (!result.eligible) continue;

      const built = new Date(`${result.post.buildDate}T00:00:00Z`).getTime();
      const sent = new Date(message.sentAt!).getTime();
      expect(built - sent).toBeLessThanOrEqual(86_400_000);
    }
  });
});
