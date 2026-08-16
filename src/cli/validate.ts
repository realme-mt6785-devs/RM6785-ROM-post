import { blockers, inspect, warnings } from "../inspect";
import { IssueThread, isApprovalLabel } from "../issue";
import { issueSuffix, recordPath } from "../paths";
import { failure, success } from "../report";

const STATUS_LABELS = ["lint:pass", "lint:fail"];

const main = async (): Promise<void> => {
  const thread = IssueThread.fromEnv();
  const labels = await thread.labels();

  if (labels.includes("posted")) {
    console.log("already published, leaving it alone");
    return;
  }

  const { post, problems } = await inspect(await thread.body());
  const stopping = blockers(problems);
  const warn = warnings(problems);

  // An edit after approval must not slip past the admin who approved the older
  // text, so approving has to happen again. Only an edit invalidates it — this
  // also runs when a label is added, and that must leave approvals alone.
  if (process.env.EVENT_ACTION === "edited") {
    for (const label of labels.filter(isApprovalLabel)) {
      await thread.removeLabel(label);
      console.log(`removed ${label}: the issue changed since it was approved`);
    }
  }

  const passed = post !== null && stopping.length === 0;

  await thread.stickyComment(
    passed
      ? success(post, warn, recordPath(post, issueSuffix(thread.number)))
      : failure(stopping, warn),
  );

  const wanted = passed ? "lint:pass" : "lint:fail";
  for (const stale of STATUS_LABELS.filter((name) => name !== wanted)) {
    if (labels.includes(stale)) await thread.removeLabel(stale);
  }
  if (!labels.includes(wanted)) await thread.addLabels([wanted]);

  console.log(
    passed
      ? "looks good"
      : `${stopping.length} thing(s) to fix:\n${stopping
          .map((problem) => `  ${problem.where} ${problem.message}`)
          .join("\n")}`,
  );
};

await main();
