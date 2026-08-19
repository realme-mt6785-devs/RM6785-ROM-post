import { blockers, inspect, warnings } from "../inspect";
import { IssueThread, isApprovalLabel } from "../issue";
import { issueSuffix, recordPath } from "../paths";
import { failure, success } from "../report";
import { previewPostToDevGroup, notifyDevGroupWithToken } from "../telegram";

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
      await notifyDevGroupWithToken(
        `WARNING: Approval removed after submission #${thread.number} was edited\n${thread.url}`,
      );
      console.log(`removed ${label}: the issue changed since it was approved`);
    }
  }

  const passed = post !== null && stopping.length === 0;

  if (passed && post) {
    await previewPostToDevGroup(post);
    await notifyDevGroupWithToken(
      `READY: Submission ${process.env.EVENT_ACTION === "opened" ? "received and" : "updated and"} passed lint for #${thread.number}\n${thread.url}`,
    );
  }

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
