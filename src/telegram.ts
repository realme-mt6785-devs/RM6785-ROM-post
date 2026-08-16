import { TelegramBot } from "node-telegram-bot-api";

import type { Post } from "./types";

import { isAnimation, probeBanner } from "./banner";
import {
  COUNTDOWN_EDIT_INTERVAL,
  POST_STYLE,
  TELEGRAM_RM6785_CHANNEL,
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
const countdown = async (bot: TelegramBot, minutes: number): Promise<void> => {
  const sent = await bot.sendMessage(
    TELEGRAM_RM6785_CHANNEL,
    countdownText(`${minutes}m`),
    { parse_mode: "HTML" },
  );

  const endsAt = Date.now() + minutes * 60_000;

  while (true) {
    const left = endsAt - Date.now();
    if (left <= 0) break;

    await sleep(Math.min(COUNTDOWN_EDIT_INTERVAL, left));

    const remaining = Math.max(0, endsAt - Date.now());
    if (remaining <= 0) break;

    const label = `${Math.floor(remaining / 60_000)}m ${Math.floor(remaining / 1000) % 60}s`;

    try {
      await bot.editMessageText({
        chat_id: TELEGRAM_RM6785_CHANNEL,
        message_id: sent.message_id,
        text: countdownText(label),
        parse_mode: "HTML",
      });
    } catch {
      // an unchanged edit or a momentary rate limit should not lose the post
    }
  }

  await bot.deleteMessage(TELEGRAM_RM6785_CHANNEL, sent.message_id);
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

  if (delayMinutes > 0) await countdown(bot, delayMinutes);

  return POST_STYLE === "rich" ? sendRich(bot, post) : sendClassic(bot, post);
};

/** Works for members whether or not the channel has a public username. */
export const messageLink = (messageId: number): string =>
  `https://t.me/c/${String(TELEGRAM_RM6785_CHANNEL).replace(/^-100/, "")}/${messageId}`;
