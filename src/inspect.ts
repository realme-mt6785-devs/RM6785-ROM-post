import type { Post, Problem } from "./types";

import { checkBanner } from "./banner";
import { extractJson } from "./issue";
import { checkRules } from "./rules";
import { checkSchema } from "./schema";

export interface Inspection {
  /** null whenever the JSON could not be trusted enough to render. */
  post: Post | null;
  problems: Problem[];
}

export interface InspectOptions {
  /** Off for local checks, so they need no network. */
  probeBanner?: boolean;
}

const only = (problem: Problem): Inspection => ({
  post: null,
  problems: [problem],
});

/**
 * Turns an issue body into either a post or a list of things to fix. Used by both
 * validation and publishing, so an approved issue is checked against exactly the
 * same rules it passed earlier.
 */
export const inspect = async (
  body: string,
  { probeBanner = true }: InspectOptions = {},
): Promise<Inspection> => {
  const json = extractJson(body);
  if (json === null) {
    return only({
      where: "",
      message:
        "I could not find a JSON object in this issue. Paste it into the Build JSON box, starting with `{`.",
    });
  }

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    return only({
      where: "",
      message: `the JSON could not be parsed — ${(error as Error).message}`,
    });
  }

  // Everything else depends on this, and the schema's per-kind rules produce
  // confusing output when it is wrong, so it is worth reporting on its own.
  const kind = (data as { postType?: unknown })?.postType;
  if (kind !== "rom" && kind !== "recovery" && kind !== "kernel") {
    return only({
      where: "postType",
      message:
        "must be `rom`, `recovery` or `kernel` — every other field depends on it",
    });
  }

  const structural = checkSchema(data);
  if (structural.length) return { post: null, problems: structural };

  const post = data as Post;
  return {
    post,
    problems: [
      ...checkRules(post),
      ...(probeBanner ? await checkBanner(post.banner) : []),
    ],
  };
};

export const blockers = (problems: Problem[]): Problem[] =>
  problems.filter((problem) => !problem.warning);

export const warnings = (problems: Problem[]): Problem[] =>
  problems.filter((problem) => problem.warning);
