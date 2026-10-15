import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import {
  ConnectorError,
  createSocialConnectors,
  initSnapshots,
  readSnapshots,
  savePull,
} from "../server/connectors.js";
import { createApp } from "../server/app.js";
import { nativePlatforms, type NativePlatform } from "../shared/connectors.js";
const env = {
  INSTAGRAM_ACCESS_TOKEN: "fixture-secret",
  INSTAGRAM_USER_ID: "12",
  META_GRAPH_VERSION: "v24.0",
  TIKTOK_ACCESS_TOKEN: "fixture-secret",
  TIKTOK_OPEN_ID: "fixture-open-id",
  LINKEDIN_ACCESS_TOKEN: "fixture-secret",
  LINKEDIN_ORGANIZATION_ID: "12",
  LINKEDIN_VERSION: "202606",
  FACEBOOK_PAGE_ACCESS_TOKEN: "fixture-secret",
  FACEBOOK_PAGE_ID: "12",
  X_BEARER_TOKEN: "fixture-secret",
  X_USER_ID: "12",
  PINTEREST_ACCESS_TOKEN: "fixture-secret",
  PINTEREST_ACCOUNT: "fixture-account",
  THREADS_ACCESS_TOKEN: "fixture-secret",
  THREADS_USER_ID: "12",
};
const date = "2026-10-01T00:00:00.000Z";
const metric = (name: string, value: number) => ({ name, values: [{ value }] });
const responses: Record<NativePlatform, unknown[]> = {
  instagram: [
    {
      data: [
        {
          id: "101",
          caption: "Balcony garden",
          timestamp: date,
          media_type: "VIDEO",
          permalink: "https://www.instagram.com/p/fixture",
          like_count: 7,
          comments_count: 2,
        },
      ],
    },
    { data: [metric("views", 120), metric("saved", 4), metric("shares", 3)] },
  ],
  tiktok: [
    {
      data: {
        videos: [
          {
            id: "101",
            title: "Balcony garden",
            create_time: Date.parse(date) / 1000,
            view_count: 120,
            like_count: 7,
            comment_count: 2,
            share_count: 3,
          },
        ],
        has_more: false,
      },
      error: { code: "ok" },
    },
  ],
  linkedin: [
    {
      elements: [
        {
          id: "urn:li:ugcPost:101",
          commentary: "Balcony garden",
          publishedAt: Date.parse(date),
        },
      ],
      paging: { links: [] },
    },
    {
      elements: [
        {
          ugcPost: "urn:li:ugcPost:101",
          totalShareStatistics: {
            impressionCount: 120,
            clickCount: 6,
            likeCount: 7,
            commentCount: 2,
            shareCount: 3,
          },
        },
      ],
    },
  ],
  facebook: [
    {
      data: [
        {
          id: "12_101",
          message: "Balcony garden",
          created_time: date,
          likes: { summary: { total_count: 7 } },
          comments: { summary: { total_count: 2 } },
          shares: { count: 3 },
        },
      ],
    },
  ],
  x: [
    {
      data: [
        {
          id: "101",
          text: "Balcony garden",
          created_at: date,
          public_metrics: {
            impression_count: 120,
            like_count: 7,
            reply_count: 2,
            retweet_count: 3,
            bookmark_count: 4,
          },
        },
      ],
      meta: { result_count: 1 },
    },
  ],
  pinterest: [
    {
      items: [
        {
          id: "101",
          title: "Balcony garden",
          created_at: date,
          pin_metrics: {
            "90d": { impression: 999 },
            lifetime_metrics: { impression: 120, pin_click: 6, reaction: 77 },
          },
        },
      ],
      bookmark: null,
    },
  ],
  threads: [
    {
      data: [
        {
          id: "101",
          text: "Balcony garden",
          timestamp: date,
          media_type: "TEXT_POST",
        },
      ],
    },
    {
      data: [
        metric("views", 120),
        metric("likes", 7),
        metric("replies", 2),
        metric("shares", 3),
        metric("reposts", 99),
      ],
    },
  ],
};
function mockFetch(payloads: unknown[], calls: URL[] = []): typeof fetch {
  let i = 0;
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.equal(url.searchParams.has("access_token"), false);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer fixture-secret",
    );
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    assert.ok(i < payloads.length, `Unexpected request ${url.pathname}`);
    return Response.json(payloads[i++]);
  }) as typeof fetch;
}
for (const platform of nativePlatforms)
  test(`${platform}: official response maps known counters and keeps unsupported metrics unknown`, async () => {
    const calls: URL[] = [];
    const connector = createSocialConnectors({
      env,
      fetch: mockFetch(responses[platform], calls),
    });
    const result = await connector.pull(platform);
    assert.equal(result.metricBasis, "lifetime");
    assert.equal(result.posts.length, 1);
    const p = result.posts[0];
    assert.equal(p.platform, platform);
    assert.equal(p.publishedAt, date);
    assert.equal(p.title, "Balcony garden");
    assert.equal(
      p.views,
      ["instagram", "tiktok", "threads"].includes(platform) ? 120 : null,
    );
    assert.equal(
      p.impressions,
      ["linkedin", "x", "pinterest"].includes(platform) ? 120 : null,
    );
    assert.equal(p.likes, platform === "pinterest" ? null : 7);
    assert.equal(
      p.clicks,
      ["linkedin", "pinterest"].includes(platform) ? 6 : null,
    );
    assert.equal(p.shares, platform === "pinterest" ? null : 3);
    assert.equal(result.truncated, false);
    if (platform === "linkedin") {
      assert.equal(
        calls[1].pathname,
        "/rest/organizationalEntityShareStatistics",
      );
      assert.equal(
        calls[1].searchParams.get("ugcPosts"),
        "List(urn:li:ugcPost:101)",
      );
    }
  });
test("pagination uses opaque cursor on fixed provider origin; never follows provider next URL", async () => {
  const first = responses.instagram[0] as object;
  const calls: URL[] = [];
  const c = createSocialConnectors({
    env,
    fetch: mockFetch(
      [
        {
          ...first,
          paging: {
            next: "https://attacker.example/?access_token=fixture-secret",
            cursors: { after: "safe-cursor" },
          },
        },
        responses.instagram[1],
        { data: [] },
      ],
      calls,
    ),
  });
  const r = await c.pull("instagram");
  assert.equal(r.posts.length, 1);
  assert.equal(calls[2].origin, "https://graph.instagram.com");
  assert.equal(calls[2].searchParams.get("after"), "safe-cursor");
});
test("lifetime captures persist separately, repeat pulls replace latest display rather than doubling totals", async () => {
  const db = new DatabaseSync(":memory:");
  initSnapshots(db);
  try {
    let now = Date.parse("2026-10-15T12:00:00Z");
    const c = createSocialConnectors({
      env,
      fetch: mockFetch([...responses.tiktok, ...responses.tiktok]),
      now: () => now,
      cooldownMs: 0,
    });
    savePull(db, await c.pull("tiktok"));
    now += 86400000;
    savePull(db, await c.pull("tiktok"));
    const r = readSnapshots(db, { platform: "tiktok", keyword: "GARDEN" });
    assert.equal(r.posts.length, 1);
    assert.equal(r.posts[0].views, 120);
    assert.equal(r.runs.length, 2);
    assert.equal(r.posts[0].collectedAt, new Date(now).toISOString());
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='social_observations'",
        )
        .get(),
      undefined,
    );
    assert.equal(
      readSnapshots(db, { platform: "x", keyword: "" }).posts.length,
      0,
    );
  } finally {
    db.close();
  }
});
test("optional unavailable insights leave blanks and warnings; auth/rate limits are sanitized and fail the pull", async () => {
  for (const status of [400, 403, 401, 429, 500]) {
    let i = 0;
    const c = createSocialConnectors({
      env,
      fetch: (async () =>
        ++i === 1
          ? Response.json(responses.instagram[0])
          : Response.json(
              { error: { message: "fixture-secret upstream internals" } },
              { status },
            )) as typeof fetch,
    });
    if ([400, 403].includes(status)) {
      const r = await c.pull("instagram");
      assert.equal(r.posts[0].views, null);
      assert.equal(r.posts[0].likes, 7);
      assert.ok(r.warnings.length);
    } else
      await assert.rejects(c.pull("instagram"), (error) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, /fixture-secret|upstream internals/);
        return true;
      });
  }
});
test("missing configuration, invalid IDs, rate guard and provider body errors do not leak tokens", async () => {
  const empty = createSocialConnectors();
  assert.equal(empty.status().length, 7);
  assert.ok(empty.status().every((s) => !s.configured));
  await assert.rejects(empty.pull("x"), /Configure/);
  const invalid = createSocialConnectors({
    env: { ...env, X_USER_ID: "../escape" },
  });
  await assert.rejects(invalid.pull("x"), /numeric/);
  const c = createSocialConnectors({ env, fetch: mockFetch(responses.tiktok) });
  await c.pull("tiktok");
  await assert.rejects(c.pull("tiktok"), /Wait 10 seconds/);
  const bodyError = createSocialConnectors({
    env,
    fetch: (async () =>
      Response.json({
        data: {},
        error: { code: "access_token_invalid", message: "fixture-secret" },
      })) as typeof fetch,
  });
  await assert.rejects(bodyError.pull("tiktok"), /token expired/);
  assert.ok(!JSON.stringify(c.status()).includes("fixture-secret"));
});
test("bounded pull records truncation, validates response schema and rejects partial X errors", async () => {
  const c = createSocialConnectors({
    env,
    fetch: mockFetch([
      {
        data: {
          videos: (responses.tiktok[0] as any).data.videos,
          has_more: true,
          cursor: 123,
        },
        error: { code: "ok" },
      },
    ]),
  });
  const result = await c.pull("tiktok", 1);
  assert.ok(result.truncated);
  assert.ok(result.warnings.length);
  const bad = createSocialConnectors({ env, fetch: mockFetch([{ data: {} }]) });
  await assert.rejects(bad.pull("x"), /unexpected timeline/);
  const partial = createSocialConnectors({
    env,
    fetch: mockFetch([
      {
        ...(responses.x[0] as object),
        errors: [{ detail: "private upstream detail" }],
      },
    ]),
  });
  await assert.rejects(partial.pull("x"), /incomplete results/);
});
test("HTTP pulls store complete snapshots atomically, expose sanitized setup, reject invalid input and preserve daily imports", async () => {
  const db = new DatabaseSync(":memory:");
  const c = createSocialConnectors({
    env,
    fetch: mockFetch(responses.tiktok),
    cooldownMs: 0,
  });
  const app = createApp(db, undefined, undefined, undefined, c);
  try {
    const status = await request(app).get("/api/integrations").expect(200);
    assert.equal(status.body.connections.length, 7);
    assert.ok(!JSON.stringify(status.body).includes("fixture-secret"));
    await request(app)
      .post("/api/social/pull/tiktok")
      .send({ maxPosts: 1 })
      .expect(200);
    const r = await request(app)
      .get("/api/social/snapshots?platform=tiktok")
      .expect(200);
    assert.equal(r.body.posts[0].views, 120);
    assert.equal(r.body.metricBasis, "lifetime");
    assert.equal(
      (
        db.prepare("SELECT COUNT(*) AS n FROM social_observations").get() as {
          n: number;
        }
      ).n,
      0,
    );
    await request(app).post("/api/social/pull/youtube").send({}).expect(400);
    await request(app)
      .post("/api/social/pull/x")
      .send({ maxPosts: 500 })
      .expect(400);
    await request(app).post("/api/social/pull/tiktok").send({}).expect(502);
    assert.equal(
      (
        db.prepare("SELECT COUNT(*) AS n FROM social_pull_runs").get() as {
          n: number;
        }
      ).n,
      1,
    );
  } finally {
    db.close();
  }
});

test("Meta HTTP 400 authentication and rate-limit codes abort optional insights instead of being treated as missing metrics", async () => {
  for (const [code, expected] of [
    [190, 401],
    [4, 429],
  ]) {
    let i = 0;
    const c = createSocialConnectors({
      env,
      fetch: (async () =>
        ++i === 1
          ? Response.json(responses.instagram[0])
          : Response.json(
              { error: { code, message: "fixture-secret" } },
              { status: 400 },
            )) as typeof fetch,
    });
    await assert.rejects(
      c.pull("instagram"),
      (error) =>
        error instanceof ConnectorError &&
        error.status === expected &&
        !error.message.includes("fixture-secret"),
    );
  }
});
