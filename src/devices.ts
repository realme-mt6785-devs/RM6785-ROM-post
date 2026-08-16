import type { Device } from "./types";

/**
 * Which phones a post says it is for. Transcribed from the bot's TITLE_PATTERNS
 * (RM6785Bot src/utils/lintUtils.ts) — the generated title has to match those
 * regexes exactly, so do not reword these.
 */
export const DEVICE_BLURB: Record<Device, string> = {
  RM6785: "Realme 6/6i(Indian)/6s/7/Narzo/Narzo 20 Pro/Narzo 30 4G",
  nemo: "Realme 6/6i(Indian)/6s/Narzo ONLY",
  RMX2001: "Realme 6/6i(Indian)/6s/Narzo ONLY",
  salaa: "Realme 7/Narzo 20 Pro/Narzo 30 4G ONLY",
  RMX2151: "Realme 7/Narzo 20 Pro/Narzo 30 4G ONLY",
};

/** Retired codenames, kept so old posts still lint. */
export const RENAMED_DEVICE: Partial<Record<Device, Device>> = {
  RMX2001: "nemo",
  RMX2151: "salaa",
};
