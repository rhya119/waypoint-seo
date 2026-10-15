import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  nativePlatforms,
  type NativePlatform,
  type NativePost,
  type PullResult,
  type SnapshotReport,
  type ConnectionStatus,
} from "../shared/connectors.js";

export class ConnectorError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Env = Record<string, string | undefined>;
// No user-supplied URLs, redirect following, token-bearing query strings, or upstream errors in responses.
const specs: Record<
  NativePlatform,
  Omit<ConnectionStatus, "platform" | "configured" | "missing">
> = {
  instagram: {
    required: [
      "INSTAGRAM_ACCESS_TOKEN",
      "INSTAGRAM_USER_ID",
      "META_GRAPH_VERSION",
    ],
    scope:
      "Instagram Login professional account; instagram_business_basic and instagram_business_manage_insights.",
    metrics:
      "Likes/comments, plus lifetime views/saves/shares when insights are available for the media.",
    docs: "https://www.postman.com/meta/instagram/overview",
  },
  tiktok: {
    required: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_OPEN_ID"],
    scope:
      "Display API user token with video.list. Reads that authorized user’s public videos.",
    metrics: "Lifetime views, likes, comments and shares.",
    docs: "https://developers.tiktok.com/doc/tiktok-api-v2-video-list/",
  },
  linkedin: {
    required: [
      "LINKEDIN_ACCESS_TOKEN",
      "LINKEDIN_ORGANIZATION_ID",
      "LINKEDIN_VERSION",
    ],
    scope:
      "Organization admin with approved Community Management access; r_organization_social and rw_organization_admin as required by LinkedIn.",
    metrics:
      "Organization post lifetime impressions, clicks, likes, comments and shares. Personal profiles are not supported.",
    docs: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics",
  },
  facebook: {
    required: [
      "FACEBOOK_PAGE_ACCESS_TOKEN",
      "FACEBOOK_PAGE_ID",
      "META_GRAPH_VERSION",
    ],
    scope:
      "Page access token with pages_read_engagement and any additional Page/app review permissions required for your account.",
    metrics:
      "Published Page post lifetime likes, comments and shares. Views and impressions remain unknown.",
    docs: "https://developers.facebook.com/docs/graph-api/reference/page/published_posts/",
  },
  x: {
    required: ["X_BEARER_TOKEN", "X_USER_ID"],
    scope:
      "X developer project with timeline read access and sufficient credits/tier. For user tokens: tweet.read and users.read.",
    metrics:
      "Public lifetime likes, replies, reposts, bookmarks and impressions when returned. No private click analytics.",
    docs: "https://docs.x.com/x-api/users/get-posts",
  },
  pinterest: {
    required: ["PINTEREST_ACCESS_TOKEN", "PINTEREST_ACCOUNT"],
    scope:
      "Pinterest approved app/token with boards:read and pins:read; business analytics access for relevant metrics.",
    metrics:
      "Pin lifetime impressions and Pin clicks when returned. Rolling 90-day metrics are excluded.",
    docs: "https://developers.pinterest.com/docs/api/v5/pins-list/",
  },
  threads: {
    required: ["THREADS_ACCESS_TOKEN", "THREADS_USER_ID"],
    scope: "Threads user token with threads_basic and threads_manage_insights.",
    metrics:
      "Lifetime post views, likes, replies and shares when insights are available. Reposts/quotes are not relabeled as shares.",
    docs: "https://www.postman.com/meta/threads/overview",
  },
};
type Json = Record<string, any>; // Provider payloads are checked at the boundary before mapping.
const object = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
const list = (value: unknown): Json[] =>
  Array.isArray(value) ? value.map(object) : [];
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
const text = (value: unknown, max = 10000) =>
  typeof value === "string" ? value.slice(0, max) : "";
function safeUrl(value: unknown) {
  try {
    const u = new URL(text(value, 2048));
    return u.protocol === "https:" && !u.username && !u.password ? u.href : "";
  } catch {
    return "";
  }
}
function timestamp(value: unknown) {
  const raw = text(value);
  // Pinterest can omit the UTC suffix. Keep its documented UTC metadata stable across hosts.
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? `${raw}Z`
    : raw;
  const date =
    typeof value === "number" ? new Date(value) : new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export function createSocialConnectors(
  options: {
    env?: Env;
    fetch?: typeof fetch;
    now?: () => number;
    cooldownMs?: number;
  } = {},
) {
  const env = options.env || {};
  const request = options.fetch || fetch;
  const now = options.now || Date.now;
  const active = new Set<NativePlatform>();
  const last = new Map<NativePlatform, number>();
  function status(): ConnectionStatus[] {
    return nativePlatforms.map((platform) => {
      const spec = specs[platform];
      const missing = spec.required.filter((key) => !env[key]?.trim());
      return { platform, ...spec, configured: missing.length === 0, missing };
    });
  }
  async function pull(
    platform: NativePlatform,
    maxPosts = 20,
  ): Promise<PullResult> {
    if (!Number.isInteger(maxPosts) || maxPosts < 1 || maxPosts > 50)
      throw new ConnectorError(400, "Request between 1 and 50 posts.");
    const missing = status().find((s) => s.platform === platform)!.missing;
    if (missing.length)
      throw new ConnectorError(
        503,
        `Configure ${missing.join(", ")} in the server .env and restart.`,
      );
    if (
      active.has(platform) ||
      now() - (last.get(platform) ?? -Infinity) < (options.cooldownMs ?? 10000)
    )
      throw new ConnectorError(
        429,
        "A pull is running or was just requested. Wait 10 seconds before trying again.",
      );
    const graph = env.META_GRAPH_VERSION || "";
    if (
      ["instagram", "facebook"].includes(platform) &&
      !/^v\d{1,3}\.0$/.test(graph)
    )
      throw new ConnectorError(
        400,
        "META_GRAPH_VERSION must be an API version supported by your Meta app, such as v24.0.",
      );
    if (
      platform === "linkedin" &&
      !/^20\d{4}$/.test(env.LINKEDIN_VERSION || "")
    )
      throw new ConnectorError(
        400,
        "LINKEDIN_VERSION must be a supported YYYYMM version.",
      );
    const idKeys: Record<NativePlatform, string> = {
      instagram: "INSTAGRAM_USER_ID",
      tiktok: "TIKTOK_OPEN_ID",
      linkedin: "LINKEDIN_ORGANIZATION_ID",
      facebook: "FACEBOOK_PAGE_ID",
      x: "X_USER_ID",
      pinterest: "PINTEREST_ACCOUNT",
      threads: "THREADS_USER_ID",
    };
    const idKey = idKeys[platform];
    const id = env[idKey]!;
    if (!id.trim() || id.length > 100)
      throw new ConnectorError(400, `${idKey} must contain 1–100 characters.`);
    if (!["tiktok", "pinterest"].includes(platform) && !/^\d{1,100}$/.test(id))
      throw new ConnectorError(400, `${idKey} must be a numeric account ID.`);
    active.add(platform);
    last.set(platform, now());
    const warnings: string[] = [];
    const deadline = AbortSignal.timeout(90000);
    const result: PullResult = {
      platform,
      account: id,
      collectedAt: "",
      metricBasis: "lifetime",
      posts: [],
      warnings,
      truncated: false,
    };
    const tokenKey = specs[platform].required[0];
    const token = env[tokenKey]!;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (platform === "linkedin") {
      headers["LinkedIn-Version"] = env.LINKEDIN_VERSION!;
      headers["X-Restli-Protocol-Version"] = "2.0.0";
      headers["X-RestLi-Method"] = "FINDER";
    }
    async function get(
      origin: string,
      path: string,
      params: Record<string, string> = {},
      body?: unknown,
    ): Promise<Json> {
      const url = new URL(path, origin);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      try {
        const response = await request(url, {
          method: body ? "POST" : "GET",
          headers: {
            ...headers,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          redirect: "error",
          signal: AbortSignal.any([deadline, AbortSignal.timeout(12000)]),
        });
        const raw = await response.text();
        if (raw.length > 4000000)
          throw new ConnectorError(
            502,
            `${platform}: response exceeds the safe size limit.`,
          );
        let data: Json = {};
        try {
          data = object(JSON.parse(raw));
        } catch {
          if (response.ok)
            throw new ConnectorError(
              502,
              `${platform}: invalid JSON response. Nothing was saved.`,
            );
        }
        const code = data.error?.code;
        const status =
          response.status === 429 ||
          [4, 17, 32, 613, "rate_limit_exceeded"].includes(code)
            ? 429
            : response.status === 401 ||
                [190, "access_token_invalid", "access_token_expired"].includes(
                  code,
                )
              ? 401
              : response.status === 403 || [10, 200].includes(code)
                ? 403
                : response.status === 400 || code === 100
                  ? 422
                  : 502;
        if (!response.ok || (data.error && code !== "ok"))
          throw new ConnectorError(
            status,
            status === 429
              ? `${platform}: provider rate limit reached; wait before pulling again.`
              : [401, 403].includes(status)
                ? `${platform}: token expired, insufficient permissions, or account access denied. Check the connection setup.`
                : `${platform}: API reported an error. Check API version, token, scopes and quota.`,
          );
        if (Array.isArray(data.errors) && data.errors.length)
          throw new ConnectorError(
            502,
            `${platform}: API returned incomplete results. Nothing was saved.`,
          );
        return data;
      } catch (error) {
        if (error instanceof ConnectorError) throw error;
        throw new ConnectorError(
          502,
          `${platform}: request failed or timed out. Nothing was saved; retry later.`,
        );
      }
    }
    function post(raw: Json, overrides: Partial<NativePost>) {
      const contentId = text(String(raw.id || ""), 200);
      if (!contentId || !overrides.publishedAt) {
        warnings.push(
          "A post without an ID or valid publication time was skipped.",
        );
        return;
      }
      const record: NativePost = {
        platform,
        account: id,
        contentId,
        title: "",
        caption: "",
        format: "post",
        url: "",
        publishedAt: "",
        views: null,
        impressions: null,
        clicks: null,
        likes: null,
        comments: null,
        shares: null,
        saves: null,
        ...overrides,
      };
      record.caption = text(record.caption);
      record.title = text(
        record.title || record.caption || `${platform} post ${contentId}`,
        500,
      );
      record.format = text(record.format, 50);
      record.url = safeUrl(record.url);
      if (!result.posts.some((p) => p.contentId === record.contentId))
        result.posts.push(record);
    }
    async function insights(
      origin: string,
      path: string,
      metrics: string,
    ): Promise<Record<string, number | null>> {
      try {
        const data = await get(origin, path, { metric: metrics });
        const values: Record<string, number | null> = {};
        for (const row of list(data.data)) {
          const value = row.total_value?.value ?? list(row.values)[0]?.value;
          values[text(row.name)] = count(value);
        }
        return values;
      } catch (error) {
        if (
          error instanceof ConnectorError &&
          [403, 422].includes(error.status)
        ) {
          warnings.push(
            "Some post insights were unavailable for this account/media; unknown metrics were left blank.",
          );
          return {};
        }
        throw error;
      }
    }
    try {
      let cursor = "";
      const seen = new Set<string>();
      let more = false;
      for (let page = 0; page < 3 && result.posts.length < maxPosts; page++) {
        let data: Json;
        const limit = String(Math.min(20, maxPosts - result.posts.length));
        if (platform === "tiktok") {
          data = await get(
            "https://open.tiktokapis.com",
            "/v2/video/list/",
            {
              fields:
                "id,title,video_description,create_time,share_url,like_count,comment_count,share_count,view_count",
            },
            {
              max_count: Number(limit),
              ...(cursor ? { cursor: Number(cursor) } : {}),
            },
          );
          if (!Array.isArray(data.data?.videos))
            throw new ConnectorError(
              502,
              "tiktok: unexpected video list response. Nothing was saved.",
            );
          for (const r of list(data.data.videos).slice(0, Number(limit)))
            post(r, {
              title: r.title,
              caption: r.video_description,
              publishedAt: timestamp(
                typeof r.create_time === "number" ? r.create_time * 1000 : null,
              ),
              url: r.share_url,
              format: "video",
              views: count(r.view_count),
              likes: count(r.like_count),
              comments: count(r.comment_count),
              shares: count(r.share_count),
            });
          more = data.data.has_more === true;
          cursor = String(data.data.cursor ?? "");
        } else if (platform === "x") {
          data = await get("https://api.x.com", `/2/users/${id}/tweets`, {
            "tweet.fields": "created_at,public_metrics",
            max_results: String(Math.max(5, Number(limit))),
            ...(cursor ? { pagination_token: cursor } : {}),
          });
          if (!Array.isArray(data.data) && data.meta?.result_count !== 0)
            throw new ConnectorError(
              502,
              "x: unexpected timeline response. Nothing was saved.",
            );
          for (const r of list(data.data).slice(0, Number(limit))) {
            const m = object(r.public_metrics);
            post(r, {
              caption: r.text,
              publishedAt: timestamp(r.created_at),
              url: `https://x.com/i/web/status/${r.id}`,
              impressions: count(m.impression_count),
              likes: count(m.like_count),
              comments: count(m.reply_count),
              shares: count(m.retweet_count),
              saves: count(m.bookmark_count),
            });
          }
          cursor = text(data.meta?.next_token);
          more = !!cursor || list(data.data).length > Number(limit);
        } else if (platform === "pinterest") {
          data = await get("https://api.pinterest.com", "/v5/pins", {
            pin_metrics: "true",
            page_size: limit,
            ...(cursor ? { bookmark: cursor } : {}),
          });
          if (!Array.isArray(data.items))
            throw new ConnectorError(
              502,
              "pinterest: unexpected Pin list response. Nothing was saved.",
            );
          for (const r of list(data.items).slice(0, Number(limit))) {
            const m = object(r.pin_metrics?.lifetime_metrics);
            post(r, {
              title: r.title,
              caption: r.description,
              publishedAt: timestamp(r.created_at),
              url: `https://www.pinterest.com/pin/${r.id}/`,
              format: r.media?.media_type || "pin",
              impressions: count(m.impression),
              clicks: count(m.pin_click),
              account: id,
            });
          }
          cursor = text(data.bookmark);
          more = !!cursor;
        } else if (platform === "linkedin") {
          const author = `urn:li:organization:${id}`;
          data = await get("https://api.linkedin.com", "/rest/posts", {
            q: "author",
            author,
            count: limit,
            start: cursor || "0",
            sortBy: "CREATED",
          });
          if (!Array.isArray(data.elements))
            throw new ConnectorError(
              502,
              "linkedin: unexpected post list response. Nothing was saved.",
            );
          for (const r of list(data.elements).slice(0, Number(limit))) {
            if (!/^urn:li:(share|ugcPost):\d+$/.test(text(r.id))) {
              warnings.push("An unsupported LinkedIn post ID was skipped.");
              continue;
            }
            let m: Json = {};
            try {
              const stat = await get(
                "https://api.linkedin.com",
                "/rest/organizationalEntityShareStatistics",
                {
                  q: "organizationalEntity",
                  organizationalEntity: author,
                  [r.id.includes(":ugcPost:") ? "ugcPosts" : "shares"]:
                    `List(${r.id})`,
                },
              );
              const rows = list(stat.elements);
              const match = rows.find(
                (row) => row.share === r.id || row.ugcPost === r.id,
              );
              if (match) m = object(match.totalShareStatistics);
              else if (rows.length)
                warnings.push(
                  "Statistics without a matching post ID were ignored.",
                );
            } catch (error) {
              if (
                error instanceof ConnectorError &&
                [403, 422].includes(error.status)
              )
                warnings.push(
                  "LinkedIn organization post statistics unavailable; check Community Management access.",
                );
              else throw error;
            }
            post(r, {
              caption: r.commentary,
              publishedAt: timestamp(r.publishedAt ?? r.createdAt),
              url: `https://www.linkedin.com/feed/update/${r.id}/`,
              impressions: count(m.impressionCount),
              clicks: count(m.clickCount),
              likes: count(m.likeCount),
              comments: count(m.commentCount),
              shares: count(m.shareCount),
            });
          }
          const start = Number(cursor || 0) + Number(limit);
          more = list(data.paging?.links).some((link) => link.rel === "next");
          cursor = String(start);
        } else {
          const origin =
            platform === "instagram"
              ? "https://graph.instagram.com"
              : platform === "threads"
                ? "https://graph.threads.net"
                : "https://graph.facebook.com";
          const prefix = platform === "threads" ? "/v1.0" : `/${graph}`;
          const edge =
            platform === "instagram"
              ? "media"
              : platform === "threads"
                ? "threads"
                : "published_posts";
          const fields =
            platform === "instagram"
              ? "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count"
              : platform === "threads"
                ? "id,text,media_type,permalink,timestamp"
                : "id,message,created_time,permalink_url,shares,likes:reactions.type(LIKE).limit(0).summary(true),comments.limit(0).summary(true)";
          data = await get(origin, `${prefix}/${id}/${edge}`, {
            fields,
            limit,
            ...(cursor ? { after: cursor } : {}),
          });
          if (!Array.isArray(data.data))
            throw new ConnectorError(
              502,
              `${platform}: unexpected post list response. Nothing was saved.`,
            );
          for (const r of list(data.data).slice(0, Number(limit))) {
            if (!/^[\d_]+$/.test(text(r.id))) {
              warnings.push("An unsupported media ID was skipped.");
              continue;
            }
            if (platform === "facebook")
              post(r, {
                caption: r.message,
                publishedAt: timestamp(r.created_time),
                url: r.permalink_url,
                likes: count(r.likes?.summary?.total_count),
                comments: count(r.comments?.summary?.total_count),
                shares: count(r.shares?.count),
              });
            else {
              const m = await insights(
                origin,
                `${prefix}/${r.id}/insights`,
                platform === "instagram"
                  ? "views,saved,shares"
                  : "views,likes,replies,shares",
              );
              post(r, {
                caption: r.caption ?? r.text,
                publishedAt: timestamp(r.timestamp),
                format: r.media_product_type || r.media_type || "post",
                url: r.permalink,
                views: m.views ?? null,
                likes:
                  platform === "instagram"
                    ? count(r.like_count)
                    : (m.likes ?? null),
                comments:
                  platform === "instagram"
                    ? count(r.comments_count)
                    : (m.replies ?? null),
                shares: m.shares ?? null,
                saves: m.saved ?? null,
              });
            }
          }
          more = !!data.paging?.next;
          cursor = text(data.paging?.cursors?.after);
        }
        if (!more) break;
        if (!cursor || seen.has(cursor)) {
          warnings.push(
            "Pagination stopped because the provider did not supply a new cursor.",
          );
          break;
        }
        seen.add(cursor);
      }
      result.truncated = more;
      if (more)
        warnings.push(
          "This pull is a bounded recent-post sample, not a complete account export.",
        );
      result.collectedAt = new Date(now()).toISOString();
      result.warnings = [...new Set(warnings)];
      return result;
    } finally {
      active.delete(platform);
    }
  }
  return { status, pull };
}
export type SocialConnectors = ReturnType<typeof createSocialConnectors>;

export function initSnapshots(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS social_pull_runs(id TEXT PRIMARY KEY,platform TEXT NOT NULL,account TEXT NOT NULL,collected_at TEXT NOT NULL,count INTEGER NOT NULL,warnings TEXT NOT NULL,truncated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS social_snapshots(run_id TEXT NOT NULL REFERENCES social_pull_runs(id),platform TEXT NOT NULL,account TEXT NOT NULL,content_id TEXT NOT NULL,collected_at TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(run_id,platform,account,content_id));
    CREATE INDEX IF NOT EXISTS snapshots_content ON social_snapshots(platform,account,content_id,collected_at DESC);`);
}
export function savePull(db: DatabaseSync, result: PullResult) {
  const runId = randomUUID();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO social_pull_runs VALUES(?,?,?,?,?,?,?)").run(
      runId,
      result.platform,
      result.account,
      result.collectedAt,
      result.posts.length,
      JSON.stringify(result.warnings),
      Number(result.truncated),
    );
    const insert = db.prepare(
      "INSERT INTO social_snapshots VALUES(?,?,?,?,?,?)",
    );
    for (const post of result.posts)
      insert.run(
        runId,
        post.platform,
        post.account,
        post.contentId,
        result.collectedAt,
        JSON.stringify(post),
      );
    db.exec("COMMIT");
    return { runId, ...result, posts: undefined, count: result.posts.length };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function readSnapshots(
  db: DatabaseSync,
  filters: { platform: NativePlatform | "all"; keyword: string },
): SnapshotReport {
  const disclosure =
    "Official API lifetime snapshots. Latest capture per post; never summed across pulls or mixed with daily imports. Topic matches are text matches, not measured search demand. Metrics differ across platforms; blanks mean unknown. Old posts outside a recent pull retain their earlier capture dates.";
  if (
    !db
      .prepare("SELECT name FROM sqlite_master WHERE name='social_snapshots'")
      .get()
  )
    return { metricBasis: "lifetime", posts: [], runs: [], disclosure };
  const rows = db
    .prepare(
      `SELECT payload,collected_at FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY platform,account,content_id ORDER BY collected_at DESC,rowid DESC) AS n FROM social_snapshots WHERE (?='all' OR platform=?)) WHERE n=1 ORDER BY collected_at DESC LIMIT 1001`,
    )
    .all(filters.platform, filters.platform) as {
    payload: string;
    collected_at: string;
  }[];
  if (rows.length > 1000)
    throw new ConnectorError(
      422,
      "More than 1,000 latest posts match. Select a platform to narrow this report.",
    );
  const posts = rows
    .map((row) => ({
      ...(JSON.parse(row.payload) as NativePost),
      collectedAt: row.collected_at,
    }))
    .filter((p) =>
      `${p.title} ${p.caption}`
        .toLocaleLowerCase()
        .includes(filters.keyword.toLocaleLowerCase()),
    );
  const runs = (
    db
      .prepare(
        `SELECT platform,account,collected_at,count,warnings,truncated FROM social_pull_runs WHERE (?='all' OR platform=?) ORDER BY rowid DESC LIMIT 20`,
      )
      .all(filters.platform, filters.platform) as {
      platform: NativePlatform;
      account: string;
      collected_at: string;
      count: number;
      warnings: string;
      truncated: number;
    }[]
  ).map((r) => ({
    platform: r.platform,
    account: r.account,
    collectedAt: r.collected_at,
    count: r.count,
    warnings: JSON.parse(r.warnings) as string[],
    truncated: !!r.truncated,
  }));
  return { metricBasis: "lifetime", posts, runs, disclosure };
}
