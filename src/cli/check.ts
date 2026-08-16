import { readFile } from "node:fs/promises";

import { POST_STYLE } from "../config";
import { blockers, inspect, warnings } from "../inspect";
import { issueSuffix, recordPath } from "../paths";
import { renderClassic, renderRich } from "../render";

const args = process.argv.slice(2);
const path = args.find((arg) => !arg.startsWith("--"));

if (!path) {
  console.error(
    "usage: bun run src/cli/check.ts <file.json> [--banner] [--preview]\n" +
      "  --banner   also fetch the banner URL to check it is an image\n" +
      "  --preview  print the post as it would be sent",
  );
  process.exit(2);
}

const { post, problems } = await inspect(await readFile(path, "utf8"), {
  probeBanner: args.includes("--banner"),
});

for (const problem of blockers(problems)) {
  console.error(`error  ${problem.where || "(post)"} ${problem.message}`);
}

for (const problem of warnings(problems)) {
  console.warn(`warn   ${problem.where || "(post)"} ${problem.message}`);
}

if (post === null || blockers(problems).length > 0) process.exit(1);

console.log(`ok     would be filed as ${recordPath(post, issueSuffix(0))}`);

if (args.includes("--preview")) {
  console.log(
    `\n--- ${POST_STYLE} ---\n${
      POST_STYLE === "rich" ? renderRich(post) : renderClassic(post).caption
    }`,
  );
}
