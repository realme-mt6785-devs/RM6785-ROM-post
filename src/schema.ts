import type { ErrorObject } from "ajv";

import Ajv from "ajv";
import addFormats from "ajv-formats";

import type { Problem } from "./types";

import schema from "../schema/post.schema.json";

// verbose gives us each failing field's own `description` from the schema, so
// error messages come from one source of truth instead of a parallel table here.
const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
addFormats(ajv);

const validate = ajv.compile(schema);

const pathOf = (instancePath: string): string =>
  instancePath
    .replace(/^\//, "")
    .replaceAll("/", ".")
    .replaceAll(/\.(\d+)/g, "[$1]");

const join = (base: string, key: string): string =>
  base ? `${base}.${key}` : key;

const hint = (error: ErrorObject): string => {
  const description = (
    error.parentSchema as { description?: string } | undefined
  )?.description;
  return description ? ` (${description})` : "";
};

const toProblem = (error: ErrorObject): Problem => {
  const at = pathOf(error.instancePath);

  switch (error.keyword) {
    case "required":
      return {
        where: join(at, error.params.missingProperty as string),
        message: "is required but missing",
      };

    case "additionalProperties":
      return {
        where: join(at, error.params.additionalProperty as string),
        message: "is not a field we recognise — check the spelling",
      };

    case "enum": {
      const allowed = (error.params.allowedValues as unknown[])
        .map((value) => `\`${value}\``)
        .join(", ");
      return { where: at, message: `must be one of ${allowed}` };
    }

    case "type":
      return {
        where: at,
        message: `must be ${error.params.type as string}${hint(error)}`,
      };

    case "pattern":
    case "format":
      return {
        where: at,
        message: `is not in the expected form${hint(error)}`,
      };

    case "minItems":
      return { where: at, message: "needs at least one entry" };

    case "maxItems":
      return {
        where: at,
        message: `has more than ${error.params.limit as number} entries`,
      };

    case "minLength":
    case "maxLength":
      return {
        where: at,
        message: `must be between ${(error.parentSchema as any)?.minLength ?? 1} and ${
          (error.parentSchema as any)?.maxLength ?? "?"
        } characters long`,
      };

    case "minimum":
    case "maximum":
      return {
        where: at,
        message: `must be ${error.keyword === "minimum" ? "at least" : "at most"} ${
          error.params.limit as number
        }`,
      };

    default:
      return { where: at, message: error.message ?? "is not valid" };
  }
};

/** Structural validation: types, enums, patterns and per-kind requirements. */
export const checkSchema = (data: unknown): Problem[] => {
  if (validate(data)) return [];

  const seen = new Set<string>();
  const problems: Problem[] = [];

  for (const error of validate.errors ?? []) {
    // `if` only reports which branch was taken; the branch's own errors follow
    if (error.keyword === "if") continue;

    const problem = toProblem(error);
    const key = `${problem.where}|${problem.message}`;
    if (seen.has(key)) continue;

    seen.add(key);
    problems.push(problem);
  }

  return problems;
};
