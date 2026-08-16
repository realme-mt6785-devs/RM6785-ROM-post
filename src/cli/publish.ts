import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { postTag } from "../fields";
import { blockers, inspect, warnings } from "../inspect";
import { IssueThread, isApprovalLabel } from "../issue";
import { issueSuffix, recordPath } from "../paths";
import { alreadyPosted, posted, rejected } from "../report";
import { messageLink, publishToChannel } from "../telegram";

/** Long enough for a tease, short enough that the runner is not idling for free. */
const MAX_DELAY_MINUTES = 30;

const parseDelay = (label: string | undefined): number => {
  const minutes = Number.parseInt(
    label?.match(/^approved:(\d+)m$/)?.[1] ?? "",
    10,
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;

  return Math.min(minutes, MAX_DELAY_MINUTES);
};

const setOutput = async (name: string, value: string): Promise<void> => {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;

  // outputs are line-based, so a value must never carry one
  await appendFile(file, `${name}=${value.replaceAll(/[\r\n]+/g, " ")}\n`);
};

const main = async (): Promise<void> => {
  const thread = IssueThread.fromEnv();
  const labels = await thread.labels();

  if (labels.includes("posted")) {
    await thread.comment(alreadyPosted(null));
    console.log("already published; refusing to send it twice");
    return;
  }

  const { post, problems } = await inspect(await thread.body());
  const stopping = blockers(problems);

  if (post === null || stopping.length > 0) {
    await thread.comment(rejected(stopping));
    for (const label of labels.filter(isApprovalLabel))
      await thread.removeLabel(label);

    console.error("approved but no longer valid, nothing sent");
    process.exit(1);
  }

  for (const warning of warnings(problems)) {
    console.warn(`warning: ${warning.where} ${warning.message}`);
  }

  const relative = recordPath(post, issueSuffix(thread.number));
  const absolute = resolve(process.env.RECORD_ROOT ?? process.cwd(), relative);

  // Belt and braces with the `posted` label: if the label was lost but the record
  // survived, this still stops a second post.
  if (existsSync(absolute)) {
    await thread.comment(alreadyPosted(null));
    console.log(`${relative} already exists; refusing to send it twice`);
    return;
  }

  const delay = parseDelay(process.env.APPROVAL_LABEL);
  if (delay > 0) console.log(`counting down ${delay}m before posting`);

  const messageId = await publishToChannel(post, delay);
  const link = messageLink(messageId);
  console.log(`posted: ${link}`);

  // Claim it immediately. Everything below can be redone by hand; sending cannot.
  await thread.addLabels(["posted"]);

  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(post, null, 2)}\n`);

  await setOutput("record", relative);
  await setOutput(
    "commit-subject",
    `${postTag(post)}: post ${post.version} for ${post.device}`,
  );

  await thread.comment(posted(post, link, relative));
  for (const label of labels.filter(isApprovalLabel))
    await thread.removeLabel(label);
  await thread.close();
};

await main();
