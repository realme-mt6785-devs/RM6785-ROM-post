import { Octokit } from "@octokit/rest";

export const MARKER = "<!-- rm6785-post-check -->";

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** The issue being validated or published, and the few operations we need on it. */
export class IssueThread {
  private constructor(
    private readonly api: Octokit,
    private readonly owner: string,
    private readonly repo: string,
    readonly number: number,
  ) {}

  static fromEnv(): IssueThread {
    const [owner, repo] = requireEnv("GITHUB_REPOSITORY").split("/");
    const number = Number.parseInt(requireEnv("ISSUE_NUMBER"), 10);

    if (!owner || !repo || !Number.isFinite(number)) {
      throw new Error(
        "GITHUB_REPOSITORY must be owner/repo and ISSUE_NUMBER a number",
      );
    }

    return new IssueThread(
      new Octokit({ auth: requireEnv("GITHUB_TOKEN") }),
      owner,
      repo,
      number,
    );
  }

  private get target() {
    return { owner: this.owner, repo: this.repo, issue_number: this.number };
  }

  async body(): Promise<string> {
    const issue = await this.api.issues.get(this.target);
    return issue.data.body ?? "";
  }

  async labels(): Promise<string[]> {
    const issue = await this.api.issues.get(this.target);
    return issue.data.labels.map((label) =>
      typeof label === "string" ? label : (label.name ?? ""),
    );
  }

  async addLabels(names: string[]): Promise<void> {
    await this.api.issues.addLabels({ ...this.target, labels: names });
  }

  /** Tolerates a label that is not there, which is the usual case. */
  async removeLabel(name: string): Promise<void> {
    try {
      await this.api.issues.removeLabel({ ...this.target, name });
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
  }

  async comment(body: string): Promise<void> {
    await this.api.issues.createComment({ ...this.target, body });
  }

  /**
   * One comment that gets rewritten on every check, so an issue edited five times
   * does not collect five verdicts.
   */
  async stickyComment(body: string): Promise<void> {
    const existing = await this.api.paginate(
      this.api.issues.listComments,
      this.target,
    );
    const mine = existing.find((comment) => comment.body?.includes(MARKER));
    const withMarker = `${MARKER}\n${body}`;

    if (mine) {
      await this.api.issues.updateComment({
        owner: this.owner,
        repo: this.repo,
        comment_id: mine.id,
        body: withMarker,
      });
      return;
    }

    await this.comment(withMarker);
  }

  async close(): Promise<void> {
    await this.api.issues.update({ ...this.target, state: "closed" });
  }
}

export const isApprovalLabel = (name: string): boolean =>
  name === "approved" || name.startsWith("approved:");

/** Long enough for a tease, short enough that a runner is not idling for free. */
export const MAX_DELAY_MINUTES = 30;

/**
 * `approved` posts straight away; `approved:5m` teases it first. Anything else,
 * including a nonsense delay, posts straight away rather than failing.
 */
export const approvalDelayMinutes = (label: string | undefined): number => {
  const minutes = Number.parseInt(
    label?.match(/^approved:(\d+)m$/)?.[1] ?? "",
    10,
  );

  if (!Number.isFinite(minutes) || minutes <= 0) return 0;

  return Math.min(minutes, MAX_DELAY_MINUTES);
};

/**
 * Pulls the JSON out of an issue body. The form wraps it in a ```json fence;
 * people editing by hand sometimes paste it bare.
 */
export const extractJson = (body: string): string | null => {
  for (const match of body.matchAll(/```[a-z]*\n([\s\S]*?)```/gi)) {
    const inner = match[1].trim();
    if (inner.startsWith("{")) return inner;
  }

  const bare = body.trim();
  return bare.startsWith("{") ? bare : null;
};
