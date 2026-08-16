/**
 * Copied verbatim from RM6785Bot src/utils/lintUtils.ts, with its logger calls
 * removed so it runs without @logtape/logtape.
 *
 * This is the linter that guards the channel. The tests run every generated post
 * through it, which is what proves the schema is a subset of the format the bot
 * accepts. When the bot's copy changes, re-copy this one and run the tests.
 */
import type { MessageEntity } from "node-telegram-bot-api";

export const NO_BANNER_ERROR =
  "# ERROR: No ROM banner was found. Please provide a banner for the ROM.";

type PostKind = "ROM" | "KERNEL" | "RECOVERY";

const RELEASE_TYPE = ["OFFICIAL", "UNOFFICIAL"];
const BUILD_TYPE: PostKind[] = ["ROM", "KERNEL", "RECOVERY"];
const DEVICE = ["RM6785", "RMX2001", "RMX2151", "salaa", "nemo"];
const ANDROID_VERSION = [
  "A10",
  "A11",
  "A12",
  "A13",
  "A14",
  "A15",
  "A16",
  "A17",
];
const RUI_VERSION = ["RUI1", "RUI2", "RUI3"];

const VALID_TITLES: Record<string, string> = {
  RM6785:
    "for Realme 6/6i(Indian)/6s/7/Narzo/Narzo 20 Pro/Narzo 30 4G [STABLE/BETA/ALPHA]",
  nemo: "for Realme 6/6i(Indian)/6s/Narzo ONLY [STABLE/BETA/ALPHA]",
  RMX2001: "for Realme 6/6i(Indian)/6s/Narzo ONLY [STABLE/BETA/ALPHA]",
  salaa: "for Realme 7/Narzo 20 Pro/Narzo 30 4G ONLY [STABLE/BETA/ALPHA]",
  RMX2151: "for Realme 7/Narzo 20 Pro/Narzo 30 4G ONLY [STABLE/BETA/ALPHA]",
};

const TITLE_PATTERNS: Record<string, RegExp> = {
  RM6785:
    /.* for Realme 6\/6i\(Indian\)\/6s\/7\/Narzo\/Narzo 20 Pro\/Narzo 30 4G \[(STABLE|BETA|ALPHA)\]/,
  nemo: /.* for Realme 6\/6i\(Indian\)\/6s\/Narzo ONLY \[(STABLE|BETA|ALPHA)\]/,
  RMX2001:
    /.* for Realme 6\/6i\(Indian\)\/6s\/Narzo ONLY \[(STABLE|BETA|ALPHA)\]/,
  salaa:
    /.* for Realme 7\/Narzo 20 Pro\/Narzo 30 4G ONLY \[(STABLE|BETA|ALPHA)\]/,
  RMX2151:
    /.* for Realme 7\/Narzo 20 Pro\/Narzo 30 4G ONLY \[(STABLE|BETA|ALPHA)\]/,
};

const BOLD_TITLE_MARKERS = [
  "for Realme 6/6i(Indian)/6s/7/Narzo/Narzo 20 Pro/Narzo 30 4G",
  "for Realme 6/6i(Indian)/6s/Narzo ONLY",
  "for Realme 7/Narzo 20 Pro/Narzo 30 4G ONLY",
];

interface BoldSections {
  title: boolean;
  notes: boolean;
  changelog: boolean;
  bugs: boolean;
  downloads: boolean;
}

const section = (name: string, errors: string): string =>
  errors ? `## ${name}:\n${errors}` : "";

const isPostKind = (tag: string): tag is PostKind =>
  (BUILD_TYPE as string[]).includes(tag);

const detectBoldSections = (
  text: string,
  entities: MessageEntity[],
): BoldSections => {
  const bold: BoldSections = {
    title: false,
    notes: !text.includes("Notes"),
    changelog: false,
    bugs: false,
    downloads: false,
  };

  for (const entity of entities) {
    if (entity.type !== "bold") continue;

    const word = text.substring(entity.offset, entity.offset + entity.length);

    if (word.includes("Notes")) bold.notes = true;
    else if (word.includes("Changelog")) bold.changelog = true;
    else if (word.includes("Bugs")) bold.bugs = true;
    else if (word.includes("Downloads")) bold.downloads = true;
    else if (BOLD_TITLE_MARKERS.some((marker) => word.includes(marker))) {
      bold.title = true;
    }
  }

  return bold;
};

// Tag order after the name (first) and build type (second) hashtags:
//   ROM       release, device, [retired device], android, rui
//   RECOVERY  release, device, [retired device], rui
//   KERNEL    device, [retired device], rui
const validateHashtags = (
  hashtags: string[],
): { errors: string; kind: PostKind; device: string | null } => {
  const buildTag = hashtags[1];
  const kind: PostKind = isPostKind(buildTag) ? buildTag : "ROM";
  const releaseTag = hashtags[2];

  let cursor = kind === "KERNEL" ? 2 : 3;
  const deviceTag = hashtags[cursor++];

  // RMX2001/RMX2151 were renamed to nemo/salaa; older posts tag both
  if (hashtags[cursor]?.includes("RMX")) cursor++;

  const androidTag = kind === "ROM" ? hashtags[cursor++] : "";
  const ruiTag = hashtags[cursor];

  if (hashtags.length === 0) {
    return {
      errors: section("Hashtags", "- No hashtags were found.\n"),
      kind,
      device: null,
    };
  }

  let errors = "";
  let device: string | null = null;

  if (!isPostKind(buildTag)) {
    errors += `- Incorrect build type mentioned on the second hashtag. (${BUILD_TYPE.join("/")})\n`;
  }

  if (kind !== "KERNEL" && !RELEASE_TYPE.includes(releaseTag)) {
    errors += `- Incorrect release type mentioned on the third hashtag. (${RELEASE_TYPE.join("/")})\n`;
  }

  if (DEVICE.includes(deviceTag)) {
    device = deviceTag;
  } else {
    const position = kind === "KERNEL" ? "third" : "fourth";
    errors += `- Incorrect device mentioned on the ${position} hashtag. (${DEVICE.join("/")})\n`;
  }

  if (kind === "ROM" && !ANDROID_VERSION.includes(androidTag)) {
    errors += `- Incorrect Android version mentioned on the fifth hashtag. (${ANDROID_VERSION.join("/")})\n`;
  }

  if (!RUI_VERSION.includes(ruiTag)) {
    errors += `- Incorrect RealmeUI version mentioned on the last hashtag. (${RUI_VERSION.join("/")})\n`;
  }

  return { errors: section("Hashtags", errors), kind, device };
};

const validateTitle = (
  text: string,
  hashtags: string[],
  device: string | null,
  boldTitle: boolean,
): string => {
  if (device === null) {
    return section(
      "Title",
      "- Cannot be validated because of hashtag errors\n",
    );
  }

  const title = text.match(TITLE_PATTERNS[device])?.[0];

  if (!title) {
    return section(
      "Title",
      `- No title or invalid title found. Based on your hashtag, it should be ${VALID_TITLES[device]}\n`,
    );
  }

  const lastHashtag = hashtags[hashtags.length - 1];
  const afterHashtags = text.slice(
    text.lastIndexOf(lastHashtag) + lastHashtag.length,
  );
  const titleNewlines = afterHashtags
    .slice(0, afterHashtags.search(/\S/))
    .match(/\n/g);

  let errors = "";

  if (titleNewlines?.length !== 2) {
    errors += "- Missing two newlines before the title\n";
  }

  if (!boldTitle) {
    errors += "- Missing bold format on title\n";
  }

  return section("Title", errors);
};

const validateBuildInfo = (text: string, kind: PostKind): string => {
  const versionLabel = kind === "KERNEL" ? "Kernel" : "Android";
  // recoveries state their version in the title, not the build info block
  const versionLine =
    kind === "RECOVERY" ? "" : `\n• ${versionLabel} version:(.+)?`;
  const infoPattern = `(.+)\n• Author:(.+)?${versionLine}\n• Build date:(.+)?`;

  if (!text.match(new RegExp(infoPattern, "i"))) {
    return section("Build info", "- Invalid build info section.\n");
  }

  let errors = "";

  if (!text.match(new RegExp(infoPattern))) {
    errors += "- Incorrect case\n";
  }

  if (!text.match(/(.+)\n• Author: (.+)/)) {
    errors += "- Invalid author info\n";
  }

  if (
    kind !== "RECOVERY" &&
    !text.match(new RegExp(`\n• ${versionLabel} version: (.+)`))
  ) {
    errors += `- Invalid ${versionLabel} version info\n`;
  }

  if (
    !text.match(
      /\n• Build date: (0?[1-9]|[12][0-9]|3[01])-(0?[1-9]|1[0-2])-\d{4}/,
    )
  ) {
    errors += "- Invalid build date info (Required format: DD-MM-YY)\n";
  }

  return section("Build info", errors);
};

const validateChangelogBugs = (text: string, bold: BoldSections): string => {
  const matchPattern =
    "\n\nChangelog\n(.+\n)+\nBugs\n(.+\n)+(\nNotes\n(.+\n)+)?";

  if (!text.match(new RegExp(matchPattern, "i"))) {
    return section("Changelog/Bugs", "- Invalid Changelog/Bugs section.\n");
  }

  let errors = "";

  if (!text.match(new RegExp(matchPattern))) {
    errors += "- Incorrect case.\n";
  } else {
    if (!bold.changelog) errors += "- Missing bold format on Changelog\n";
    if (!bold.bugs) errors += "- Missing bold format on Bugs\n";
    if (!bold.notes) errors += "- Missing bold format on Notes\n";
  }

  if (!text.match(/\n\nChangelog\n•/)) {
    errors += "- Invalid Changelog section.\n";
  }

  if (!text.match(/\nBugs\n•/)) {
    errors += "- Invalid Bugs section.\n";
  }

  if (text.match(/\nNote/i) && !text.match(/\nNotes\n•/)) {
    errors += "- Invalid notes section.\n";
  }

  return section("Changelog/Bugs", errors);
};

const validateDownloads = (
  text: string,
  kind: PostKind,
  boldDownloads: boolean,
): string => {
  // only ROMs ship flavours (vanilla/gapps/...), so only they state a build type
  const buildTypeLine = kind === "ROM" ? "• Build type:(.+)?\n" : "";
  const matchPattern = `\n\nDownloads\n${buildTypeLine}• File size:(.+)?\n• Download\n`;

  if (!text.match(new RegExp(matchPattern, "i"))) {
    return section("Downloads", "- Invalid Downloads section.\n");
  }

  let errors = "";

  if (!text.match(new RegExp(matchPattern))) {
    errors += "- Incorrect case.\n";
  } else if (!boldDownloads) {
    errors += "- Missing bold format on Downloads.\n";
  }

  if (kind === "ROM" && !text.match(/(.+)\n• Build type: (.+)/)) {
    errors += "- Invalid build type\n";
  }

  if (!text.match(/(.+)\n• File size: (.+)/)) {
    errors += "- Invalid file size\n";
  }

  return section("Downloads", errors);
};

const validateFooter = (text: string, kind: PostKind): string => {
  const matchPattern =
    kind === "KERNEL"
      ? "\nSources\nSupport group"
      : "\nSources\nScreenshots\nSupport group";

  if (!text.match(new RegExp(matchPattern, "i"))) {
    return section(
      "Footer",
      `- Invalid footer section.\n  Should be written exactly like this:${matchPattern}\n`,
    );
  }

  if (!text.match(new RegExp(matchPattern))) {
    return section(
      "Footer",
      `- Incorrect case.\n  Correct usage:${matchPattern}\n`,
    );
  }

  return "";
};

const lintTelegramPost = (
  text: string,
  entities: MessageEntity[],
): [string, boolean] => {
  const hashtags = text.match(/#\w+/g)?.map((tag) => tag.slice(1)) ?? [];
  const { errors: hashtagErrors, kind, device } = validateHashtags(hashtags);
  const bold = detectBoldSections(text, entities);

  const errors = [
    hashtagErrors,
    validateTitle(text, hashtags, device, bold.title),
    validateBuildInfo(text, kind),
    validateChangelogBugs(text, bold),
    validateDownloads(text, kind, bold.downloads),
    validateFooter(text, kind),
  ]
    .filter((part) => part.trim())
    .join("\n");

  const lintStatus = !errors.trim();
  const lintResult = lintStatus
    ? "# Seems good 🤌\nBot approves"
    : `# ERRORS\n\n${errors}`;

  return [lintResult, lintStatus];
};

export default lintTelegramPost;
