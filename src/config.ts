export type PostStyle = "classic" | "rich";

const intFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optionalIntFromEnv = (name: string): number | null => {
  const raw = process.env[name]?.trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * How posts reach the channel.
 *
 *   classic — a photo (or GIF) with a caption. Every Telegram client renders it.
 *   rich    — Telegram's rich message API. Nicer typography, but clients that
 *             predate it show the reader nothing useful, which is why the
 *             channel went back to classic after trying it.
 *
 * Flip the fallback below to change every future post at once, or set the
 * POST_STYLE repository variable to do it without a commit. Deliberately not a
 * per-build option in the JSON: mixed styles would make the channel look untidy.
 */
export const POST_STYLE: PostStyle =
  process.env.POST_STYLE?.trim().toLowerCase() === "rich" ? "rich" : "classic";

export const TELEGRAM_RM6785_CHANNEL = intFromEnv(
  "TELEGRAM_RM6785_CHANNEL",
  -1001384382397,
);

export const TELEGRAM_DEV_GROUP = optionalIntFromEnv("TELEGRAM_DEV_GROUP");

export const TELEGRAM_STICKER_FILE_ID =
  process.env.TELEGRAM_STICKER_FILE_ID?.trim() ||
  "CAACAgUAAxkBAAIX12Rci3DXLH_h_hjgvbkmM6YSMEhUAAIvBAAC3gABcVWicSZoSZsiti8E";

/**
 * Telegram's photo caption limit, in UTF-16 code units. Hard limit: the API
 * rejects anything longer, so a post over it is a validation failure.
 */
export const CAPTION_LIMIT = 1024;

/**
 * Rich messages allow considerably more than a caption, but the exact ceiling is
 * not documented anywhere we can cite. Treated as a warning threshold only.
 */
export const RICH_SOFT_LIMIT = 4096;

/** How often the countdown message is edited. */
export const COUNTDOWN_EDIT_INTERVAL = 15_000;
