import type TelegramBot from "node-telegram-bot-api";

import { describe, expect, test } from "bun:test";

import { TELEGRAM_RM6785_CHANNEL } from "../src/config";
import { countdown } from "../src/telegram";

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

    expect(await countdown(bot, 0)).toBe(10);
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
});
