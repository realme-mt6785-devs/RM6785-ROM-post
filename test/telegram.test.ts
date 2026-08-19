import type TelegramBot from "node-telegram-bot-api";

import { describe, expect, test } from "bun:test";

import { TELEGRAM_RM6785_CHANNEL } from "../src/config";
import { countdown, notifyDevGroup } from "../src/telegram";

const fakeBot = (failCountdown = false) => {
  const calls: string[] = [];
  const bot = {
    sendSticker: async (chatId: number) => {
      calls.push(`sticker:${chatId}`);
      return { message_id: 10 };
    },
    sendMessage: async (chatId: number) => {
      calls.push(`countdown:${chatId}`);
      if (failCountdown) throw new Error("countdown failed");
      return { message_id: 11 };
    },
    editMessageText: async () => undefined,
    deleteMessage: async (chatId: number, messageId: number) => {
      calls.push(`delete:${chatId}:${messageId}`);
      return true;
    },
  } as unknown as TelegramBot;

  return { bot, calls };
};

describe("countdown sticker", () => {
  test("stays above a successful delayed post", async () => {
    const { bot, calls } = fakeBot();

    expect(await countdown(bot, 0)).toEqual([10]);
    expect(calls).toEqual([
      `sticker:${TELEGRAM_RM6785_CHANNEL}`,
      `countdown:${TELEGRAM_RM6785_CHANNEL}`,
      `delete:${TELEGRAM_RM6785_CHANNEL}:11`,
    ]);
  });

  test("is removed when countdown setup fails", async () => {
    const { bot, calls } = fakeBot(true);

    await expect(countdown(bot, 0)).rejects.toThrow("countdown failed");
    expect(calls).toContain(`delete:${TELEGRAM_RM6785_CHANNEL}:10`);
  });

  test("is mirrored to the dev group", async () => {
    const { bot, calls } = fakeBot();
    const devGroup = -1001234567890;

    expect(
      await countdown(bot, 0, [TELEGRAM_RM6785_CHANNEL, devGroup]),
    ).toEqual([10, 10]);
    expect(calls).toEqual([
      `sticker:${TELEGRAM_RM6785_CHANNEL}`,
      `sticker:${devGroup}`,
      `countdown:${TELEGRAM_RM6785_CHANNEL}`,
      `countdown:${devGroup}`,
      `delete:${TELEGRAM_RM6785_CHANNEL}:11`,
      `delete:${devGroup}:11`,
    ]);
  });
});

describe("dev-group notifications", () => {
  test("send to the configured chat", async () => {
    const { bot, calls } = fakeBot();
    await notifyDevGroup(bot, "ready", -1001234567890);
    expect(calls).toContain("countdown:-1001234567890");
  });

  test("do not block when Telegram refuses them", async () => {
    const { bot } = fakeBot(true);
    await expect(
      notifyDevGroup(bot, "ready", -1001234567890),
    ).resolves.toBeUndefined();
  });
});
