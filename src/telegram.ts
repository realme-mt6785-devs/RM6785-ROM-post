import { TelegramBot } from "node-telegram-bot-api";

import type { Post } from "./types";

import { isAnimation, probeBanner } from "./banner";
import {
  COUNTDOWN_EDIT_INTERVAL,
  POST_STYLE,
  TELEGRAM_DEV_GROUP,
  TELEGRAM_RM6785_CHANNEL,
  TELEGRAM_STICKER_FILE_ID,
} from "./config";
import { renderClassic, renderRich } from "./render";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const countdownText = (remaining: string): string =>
  `Something incoming! Scheduled in <b>${remaining}</b>`;

/**
 * Teases the post, then clears the tease. The bot's /post edits its countdown
 * into the finished post, but Telegram will not turn a text message into a media
 * one, so this deletes and sends instead — the same thing /postrich does.
 */
export const countdown = async (
  bot: TelegramBot,
  minutes: number,
  destinations: number[] = [
    TELEGRAM_RM6785_CHANNEL,
    ...(TELEGRAM_DEV_GROUP === null ? [] : [TELEGRAM_DEV_GROUP]),
  ],
): Promise<number[]> => {
  const stickers: { message_id: number }[] = [];
  const countdownMessages: { chatId: number; messageId: number }[] = [];

  try {
    for (const chatId of destinations) {
      stickers.push(await bot.sendSticker(chatId, TELEGRAM_STICKER_FILE_ID));
    }

    const sent = await Promise.all(
      destinations.map(async (chatId) => {
        const message = await bot.sendMessage(
          chatId,
          countdownText(`${minutes}m`),
          { parse_mode: "HTML" },
        );
        countdownMessages.push({ chatId, messageId: message.message_id });
        return message;
      }),
    );

    const endsAt = Date.now() + minutes * 60_000;

    while (true) {
      const left = endsAt - Date.now();
      if (left <= 0) break;

      await sleep(Math.min(COUNTDOWN_EDIT_INTERVAL, left));

      const remaining = Math.max(0, endsAt - Date.now());
      if (remaining <= 0) break;

      const label = `${Math.floor(remaining / 60_000)}m ${Math.floor(remaining / 1000) % 60}s`;

      await Promise.allSettled(
        sent.map((message, index) =>
          bot.editMessageText({
            chat_id: destinations[index],
            message_id: message.message_id,
            text: countdownText(label),
            parse_mode: "HTML",
          }),
        ),
      );
    }

    await Promise.all(
      countdownMessages.map(({ chatId, messageId }) =>
        bot.deleteMessage(chatId, messageId),
      ),
    );
    return stickers.map((sticker) => sticker.message_id);
  } catch (error) {
    await Promise.allSettled([
      ...stickers.map((sticker, index) =>
        bot.deleteMessage(destinations[index], sticker.message_id),
      ),
      ...countdownMessages.map(({ chatId, messageId }) =>
        bot.deleteMessage(chatId, messageId),
      ),
    ]);
    throw error;
  }
};

const devSend = async (
  action: (chatId: number) => Promise<unknown>,
  chatId: number | null = TELEGRAM_DEV_GROUP,
): Promise<void> => {
  if (chatId === null) return;
  try {
    await action(chatId);
  } catch (error) {
    console.warn(`dev-group notification failed: ${(error as Error).message}`);
  }
};

export const notifyDevGroup = async (
  bot: TelegramBot,
  text: string,
  chatId: number | null = TELEGRAM_DEV_GROUP,
): Promise<void> => devSend((target) => bot.sendMessage(target, text), chatId);

export const previewToDevGroup = async (
  bot: TelegramBot,
  post: Post,
): Promise<void> => {
  if (TELEGRAM_DEV_GROUP === null) return;

  try {
    if (POST_STYLE === "rich") {
      await bot.sendRichMessage(TELEGRAM_DEV_GROUP, {
        markdown: renderRich(post),
      });
      return;
    }

    const { caption, entities } = renderClassic(post);
    const probe = await probeBanner(post.banner);
    const options = { caption, caption_entities: entities };
    if (isAnimation(probe.contentType))
      await bot.sendAnimation(TELEGRAM_DEV_GROUP, post.banner, options);
    else await bot.sendPhoto(TELEGRAM_DEV_GROUP, post.banner, options);
  } catch (error) {
    console.warn(`dev-group preview failed: ${(error as Error).message}`);
  }
};

const botFromEnv = (): TelegramBot | null => {
  const token = process.env.BOT_TOKEN?.trim();
  return token ? new TelegramBot(token, { polling: false }) : null;
};

export const notifyDevGroupWithToken = async (text: string): Promise<void> => {
  const bot = botFromEnv();
  if (!bot) return;
  await notifyDevGroup(bot, text);
};

export const previewPostToDevGroup = async (post: Post): Promise<void> => {
  const bot = botFromEnv();
  if (!bot) return;
  await previewToDevGroup(bot, post);
};

const sendClassic = async (bot: TelegramBot, post: Post): Promise<number> => {
  const { caption, entities } = renderClassic(post);
  const probe = await probeBanner(post.banner);
  const options = { caption, caption_entities: entities };

  // an animated banner has to go out as an animation; sendPhoto would flatten or
  // reject it
  const sent = isAnimation(probe.contentType)
    ? await bot.sendAnimation(TELEGRAM_RM6785_CHANNEL, post.banner, options)
    : await bot.sendPhoto(TELEGRAM_RM6785_CHANNEL, post.banner, options);

  return sent.message_id;
};

const sendRich = async (bot: TelegramBot, post: Post): Promise<number> => {
  const sent = await bot.sendRichMessage(TELEGRAM_RM6785_CHANNEL, {
    markdown: renderRich(post),
  });

  return sent.message_id;
};

export const publishToChannel = async (
  post: Post,
  delayMinutes: number,
): Promise<number> => {
  const token = process.env.BOT_TOKEN?.trim();
  if (!token) throw new Error("BOT_TOKEN is not set");

  const bot = new TelegramBot(token, { polling: false });
  let stickerMessageIds: number[] | undefined;

  try {
    if (delayMinutes > 0) {
      stickerMessageIds = await countdown(bot, delayMinutes);
    }

    return POST_STYLE === "rich" ? sendRich(bot, post) : sendClassic(bot, post);
  } catch (error) {
    if (stickerMessageIds !== undefined) {
      const destinations = [
        TELEGRAM_RM6785_CHANNEL,
        ...(TELEGRAM_DEV_GROUP === null ? [] : [TELEGRAM_DEV_GROUP]),
      ];
      await Promise.allSettled(
        stickerMessageIds.map((messageId, index) =>
          bot.deleteMessage(destinations[index], messageId),
        ),
      );
    }
    throw error;
  }
};

/** Works for members whether or not the channel has a public username. */
export const messageLink = (messageId: number): string =>
  `https://t.me/c/${String(TELEGRAM_RM6785_CHANNEL).replace(/^-100/, "")}/${messageId}`;
