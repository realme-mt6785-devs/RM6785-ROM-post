export type PostType = "rom" | "recovery" | "kernel";
export type Stability = "STABLE" | "BETA" | "ALPHA";
export type ReleaseType = "OFFICIAL" | "UNOFFICIAL";
export type Device = "RM6785" | "nemo" | "salaa" | "RMX2001" | "RMX2151";

/** Mirrors schema/post.schema.json. Keep the two in step. */
export interface Post {
  $schema?: string;
  postType: PostType;
  name: string;
  tag: string;
  stability: Stability;
  releaseType?: ReleaseType;
  device: Device;
  androidVersion?: string;
  kernelVersion?: string;
  ruiVersion: 1 | 2 | 3;
  author: string;
  buildDate: string;
  banner: string;
  changelog: string[];
  bugs: string[];
  notes?: string[];
  download: {
    buildType?: string;
    fileSize: string;
    url: string;
  };
  links: {
    sources: string;
    screenshots?: string;
    supportGroup: string;
    donate?: string;
  };
}

/** Something a contributor has to fix before the post can go out. */
export interface Problem {
  /** Dotted path into the JSON, or "" when it is about the post as a whole. */
  where: string;
  message: string;
  /** Warnings are reported but do not block approval. */
  warning?: boolean;
}
