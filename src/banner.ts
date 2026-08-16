import type { Problem } from "./types";

export interface BannerProbe {
  ok: boolean;
  contentType: string | null;
  detail: string;
}

/**
 * Looks at the banner without downloading it. Some hosts reject HEAD, so fall
 * back to asking for the first byte.
 */
export const probeBanner = async (url: string): Promise<BannerProbe> => {
  const attempt = async (init: RequestInit): Promise<Response> =>
    fetch(url, { redirect: "follow", ...init });

  try {
    let response = await attempt({ method: "HEAD" });
    if (!response.ok) {
      response = await attempt({
        method: "GET",
        headers: { Range: "bytes=0-0" },
      });
    }

    return {
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, contentType: null, detail: (error as Error).message };
  }
};

/** GIF and video banners have to be sent as animations, not photos. */
export const isAnimation = (contentType: string | null): boolean =>
  /^(image\/gif|video\/)/i.test(contentType ?? "");

export const checkBanner = async (url: string): Promise<Problem[]> => {
  const probe = await probeBanner(url);

  if (!probe.ok) {
    return [
      {
        where: "banner",
        message: `could not be fetched (${probe.detail}) — check the link is public`,
      },
    ];
  }

  if (!/^(image|video)\//i.test(probe.contentType ?? "")) {
    return [
      {
        where: "banner",
        message: `serves ${probe.contentType ?? "no content type"} rather than an image or GIF — link the file itself, not a page showing it`,
      },
    ];
  }

  return [];
};
