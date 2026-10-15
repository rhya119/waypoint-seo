import { z } from "zod";
import type { Metrics } from "./performance.js";
export const nativePlatforms = [
  "instagram",
  "tiktok",
  "linkedin",
  "facebook",
  "x",
  "pinterest",
  "threads",
] as const;
export const nativePlatform = z.enum(nativePlatforms);
export type NativePlatform = (typeof nativePlatforms)[number];
export const pullInput = z.object({
  maxPosts: z.number().int().min(1).max(50).default(20),
});
export type ConnectionStatus = {
  platform: NativePlatform;
  configured: boolean;
  required: string[];
  missing: string[];
  scope: string;
  metrics: string;
  docs: string;
};
export type NativePost = Metrics & {
  platform: NativePlatform;
  account: string;
  contentId: string;
  title: string;
  caption: string;
  publishedAt: string;
  format: string;
  url: string;
};
export type PullResult = {
  platform: NativePlatform;
  account: string;
  collectedAt: string;
  metricBasis: "lifetime";
  posts: NativePost[];
  warnings: string[];
  truncated: boolean;
};
export const snapshotFilters = z.object({
  platform: z.union([nativePlatform, z.literal("all")]).default("all"),
  keyword: z.string().trim().max(200).default(""),
});
export type SnapshotReport = {
  metricBasis: "lifetime";
  posts: (NativePost & { collectedAt: string })[];
  runs: {
    platform: NativePlatform;
    account: string;
    collectedAt: string;
    count: number;
    warnings: string[];
    truncated: boolean;
  }[];
  disclosure: string;
};
