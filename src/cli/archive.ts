import { TelegramClient } from "@mtcute/bun";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { ArchiveEntity } from "../archive";

import { archivePost, archiveRichPost } from "../archive";
import { messageSuffix, recordPath } from "../paths";

interface Options {
  channel: string;
  limit?: number;
  maxId?: number;
  minId?: number;
  output: string;
  session: string;
  verbose: boolean;
  write: boolean;
}

const usage = `Usage: bun run archive [options]

Scans @RM6785 with a Telegram user account. It is a dry run unless --write is set.

Required environment:
  TG_API_ID              API ID from https://my.telegram.org
  TG_API_HASH            API hash from https://my.telegram.org

Optional environment:
  TG_PHONE               Account phone number; prompted when omitted
  TG_SESSION             Exported mtcute session string

Options:
  --write                Write eligible JSON records
  --output <directory>   Record root (default: current directory)
  --channel <peer>       Username or marked chat ID (default: @RM6785)
  --limit <count>        Stop after this many messages
  --min-id <id>          Ignore messages at or below this ID
  --max-id <id>          Ignore messages at or above this ID
  --session <path>       Local session database (default: .archive-session)
  --verbose              Also print non-candidate messages
  --help                 Show this help
`;

const positiveInt = (flag: string, raw: string | undefined): number => {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${flag} needs a positive integer`);
  }
  return value;
};

const valueAfter = (args: string[], index: number, flag: string): string => {
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} needs a value`);
  return value;
};

const optionsFrom = (args: string[]): Options => {
  const options: Options = {
    channel: process.env.TG_CHANNEL?.trim() || "@RM6785",
    output: process.cwd(),
    session: ".archive-session",
    verbose: false,
    write: false,
  };

  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    switch (flag) {
      case "--channel":
        options.channel = valueAfter(args, index++, flag);
        break;
      case "--help":
        console.log(usage);
        process.exit(0);
        break;
      case "--limit":
        options.limit = positiveInt(flag, valueAfter(args, index++, flag));
        break;
      case "--max-id":
        options.maxId = positiveInt(flag, valueAfter(args, index++, flag));
        break;
      case "--min-id":
        options.minId = positiveInt(flag, valueAfter(args, index++, flag));
        break;
      case "--output":
        options.output = resolve(valueAfter(args, index++, flag));
        break;
      case "--session":
        options.session = valueAfter(args, index++, flag);
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--write":
        options.write = true;
        break;
      default:
        throw new Error(`unknown option: ${flag}\n\n${usage}`);
    }
  }

  return options;
};

const apiCredentials = (): { apiHash: string; apiId: number } => {
  const apiId = Number(process.env.TG_API_ID);
  const apiHash = process.env.TG_API_HASH?.trim();
  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash) {
    throw new Error("TG_API_ID and TG_API_HASH must be set");
  }
  return { apiHash, apiId };
};

const writeRecord = async (
  path: string,
  json: string,
): Promise<"same" | "written"> => {
  await mkdir(dirname(path), { recursive: true });
  if (existsSync(path)) {
    if ((await readFile(path, "utf8")) === json) return "same";
    throw new Error(`refusing to replace a different record at ${path}`);
  }
  await writeFile(path, json, { flag: "wx" });
  return "written";
};

const main = async (): Promise<void> => {
  const options = optionsFrom(process.argv.slice(2));
  const client = new TelegramClient({
    ...apiCredentials(),
    storage: options.session,
  });

  const counts = {
    candidates: 0,
    eligible: 0,
    messages: 0,
    rejected: 0,
    rich: 0,
    written: 0,
  };

  try {
    await client.start({
      code: () => client.input("Login code: "),
      password: () => client.input("2FA password: "),
      phone: () =>
        process.env.TG_PHONE?.trim() || client.input("Phone number: "),
      session: process.env.TG_SESSION?.trim(),
    });

    for await (const message of client.iterHistory(options.channel, {
      limit: options.limit,
      maxId: options.maxId,
      minId: options.minId,
    })) {
      counts.messages++;

      const entities: ArchiveEntity[] = message.entities.map((entity) => ({
        kind: entity.kind,
        length: entity.length,
        offset: entity.offset,
        url: entity.is("text_link") ? entity.params.url : undefined,
      }));
      const result = message.richMessage
        ? archiveRichPost({
            blocks: message.richMessage.blocks,
            chatId: message.chat.id,
            id: message.id,
            sentAt: message.date.toISOString(),
          })
        : archivePost({
            chatId: message.chat.id,
            entities,
            id: message.id,
            mediaType: message.media?.type ?? null,
            sentAt: message.date.toISOString(),
            text: message.text,
          });

      if (message.richMessage && result.eligible) counts.rich++;

      if (!result.eligible) {
        if (result.candidate) {
          counts.candidates++;
          counts.rejected++;
          console.log(`! ${message.id}: ${result.reason} (${message.link})`);
        } else if (options.verbose) {
          console.log(`- ${message.id}: ${result.reason}`);
        }
        continue;
      }

      counts.candidates++;
      counts.eligible++;
      const relative = recordPath(result.post, messageSuffix(message.id));
      const destination = resolve(options.output, relative);
      console.log(`+ ${message.id}: ${relative} (${message.link})`);

      if (options.write) {
        const json = `${JSON.stringify(result.post, null, 2)}\n`;
        if ((await writeRecord(destination, json)) === "written")
          counts.written++;
      }
    }
  } finally {
    await client.destroy();
  }

  console.log(
    [
      `scanned ${counts.messages}`,
      `${counts.eligible} eligible`,
      `${counts.rejected} rejected candidate(s)`,
      `${counts.rich} rich post(s) parsed`,
      options.write ? `${counts.written} written` : "dry run; nothing written",
    ].join("; "),
  );
};

await main();
