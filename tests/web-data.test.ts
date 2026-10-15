import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import request from "supertest";
import {
  initWebData,
  previewWebImport,
  importWebData,
  webReport,
} from "../server/web-data.js";
import { createApp } from "../server/app.js";
import { type WebImportInput } from "../shared/web-data.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const input: WebImportInput = {
  domain: "actual-site.example",
  kind: "search",
  from: "2026-10-01",
  to: "2026-10-15",
  source: "Synthetic test fixture shaped like Search Console CSV",
  scope: "All countries/devices; web search",
  csv: 'Top queries,Clicks,Impressions,CTR,Position\n"garden, small",10,100,10%,4.5\ngarden balcony,20,200,10%,8',
};
test("free workspace stays empty rather than substituting fictional metrics; native English query headers and totals are supported", () => {
  const db = new DatabaseSync(":memory:");
  initWebData(db);
  try {
    const empty = webReport(db, input.domain);
    assert.equal(empty.totals.clicks, null);
    assert.equal(empty.queries.length, 0);
    const preview = previewWebImport(input);
    assert.ok(preview.valid);
    assert.equal(preview.count, 2);
    importWebData(db, input);
    const r = webReport(db, input.domain);
    assert.equal(r.provenance, "imported");
    assert.equal(r.totals.clicks, 30);
    assert.equal(r.totals.impressions, 300);
    assert.equal(r.totals.ctr, 10);
    assert.equal(r.queries[0].position, 8);
    assert.equal(r.totals.backlinks, null);
  } finally {
    db.close();
  }
});
test("matching window/scope replaces atomically, overlapping windows stay independent, invalid rows cannot partially write", () => {
  const db = new DatabaseSync(":memory:");
  initWebData(db);
  try {
    importWebData(db, input);
    importWebData(db, input);
    let r = webReport(db, input.domain);
    assert.equal(r.datasets.length, 1);
    const first = r.search!.id;
    importWebData(db, { ...input, from: "2026-10-10" });
    r = webReport(db, input.domain);
    assert.equal(r.datasets.length, 2);
    assert.equal(r.totals.clicks, 30);
    assert.equal(webReport(db, input.domain, first).search?.from, "2026-10-01");
    assert.throws(
      () =>
        importWebData(db, {
          ...input,
          csv: "query,clicks,impressions\ngood,1,10\nbad,20,1",
        }),
      /Clicks cannot exceed/,
    );
    assert.equal(webReport(db, input.domain, first).totals.clicks, 30);
    assert.throws(() => webReport(db, "another.example", first), /not found/);
  } finally {
    db.close();
  }
});
test("strict CSV/date validation rejects duplicate queries, malformed columns, future observation windows and unsafe URLs", () => {
  assert.equal(
    previewWebImport({
      ...input,
      csv: "query,clicks,impressions\ngarden,1,10\ngarden,2,20",
    }).valid,
    false,
  );
  assert.throws(
    () =>
      previewWebImport({
        ...input,
        csv: "query,clicks,impressions\ngarden,1,10,extra",
      }),
    /Invalid CSV/,
  );
  assert.throws(() => previewWebImport({ ...input, from: "2026-02-30" }));
  const links = {
    ...input,
    kind: "backlinks",
    csv: "source_url,target_url,anchor,rel\njavascript:alert(1),https://actual-site.example/,garden,nofollow",
  };
  assert.equal(previewWebImport(links).valid, false);
  assert.equal(
    previewWebImport({
      ...input,
      kind: "ranks",
      csv: "keyword,date,position\ngarden,2026-11-01,3",
    }).valid,
    false,
  );
});
test("backlink rows use supplied URL pairs, validate target ownership, count exact referring hosts and preserve unknown rel", () => {
  const db = new DatabaseSync(":memory:");
  initWebData(db);
  try {
    importWebData(db, {
      ...input,
      kind: "backlinks",
      csv: "source_url,target_url,anchor\nhttps://source.example/a,https://actual-site.example/garden,garden\nhttps://source.example/b,https://blog.actual-site.example/ideas,ideas",
    });
    const r = webReport(db, input.domain);
    assert.equal(r.totals.backlinks, 2);
    assert.equal(r.totals.referringHosts, 1);
    assert.equal(r.links[0].rel, "unknown");
    assert.throws(
      () =>
        importWebData(db, {
          ...input,
          kind: "backlinks",
          csv: "source_url,target_url\nhttps://source.example/,https://other.example/",
        }),
      /selected domain/,
    );
  } finally {
    db.close();
  }
});
test("manual ranks retain latest and previous observed positions without substituting Search Console averages", () => {
  const db = new DatabaseSync(":memory:");
  initWebData(db);
  try {
    importWebData(db, input);
    importWebData(db, {
      ...input,
      kind: "ranks",
      csv: "keyword,date,position,country,device\ngarden,2026-10-01,10,NZ,mobile\ngarden,2026-10-15,6,NZ,mobile",
    });
    const r = webReport(db, input.domain);
    assert.equal(r.ranks.length, 1);
    assert.equal(r.ranks[0].position, 6);
    assert.equal(r.ranks[0].previous, 10);
    assert.equal(r.ranks[0].change, 4);
  } finally {
    db.close();
  }
});
test("comparisons require matching dates and scope; source mismatches remain labeled and missing scores stay null", () => {
  const db = new DatabaseSync(":memory:");
  initWebData(db);
  try {
    importWebData(db, input);
    importWebData(db, {
      ...input,
      domain: "comparison.example",
      csv: "query,clicks,impressions\ngarden balcony,3,30\nplant pots,2,40",
    });
    importWebData(db, {
      ...input,
      domain: "mismatched.example",
      scope: "mobile only",
    });
    const r = webReport(db, input.domain);
    const good = r.competitors.find((c) => c.domain === "comparison.example")!;
    assert.equal(good.sharedQueries, 1);
    assert.equal(good.uniqueQueries, 1);
    assert.equal(Math.round(good.overlap!), 33);
    const bad = r.competitors.find((c) => c.domain === "mismatched.example")!;
    assert.equal(bad.comparable, false);
    assert.equal(bad.overlap, null);
    assert.equal(bad.sharedQueries, null);
  } finally {
    db.close();
  }
});
test("HTTP import/audit/watchlist/report routes validate, persist and protect the private proxy origin", async () => {
  const db = new DatabaseSync(":memory:");
  const app = createApp(db, undefined, undefined, undefined, undefined, {
    privateOrigin: "https://machine.example.ts.net",
  });
  try {
    await request(app)
      .get("/api/web/report?domain=actual-site.example")
      .set("Host", "machine.example.ts.net")
      .expect(200);
    await request(app)
      .post("/api/web/import")
      .set("Host", "machine.example.ts.net")
      .set("Origin", "https://machine.example.ts.net")
      .send(input)
      .expect(200);
    await request(app)
      .post("/api/web/import")
      .set("Host", "machine.example.ts.net")
      .set("Origin", "https://attacker.example")
      .send(input)
      .expect(403);
    await request(app)
      .post("/api/web/track")
      .send({ domain: input.domain, keyword: "new query" })
      .expect(200);
    let r = await request(app)
      .get(`/api/web/report?domain=${input.domain}`)
      .expect(200);
    assert.equal(r.body.ranks.length, 0);
    assert.equal(r.body.tracks.length, 1);
    await request(app)
      .post("/api/web/audit")
      .send({
        domain: input.domain,
        html: '<html lang="en"><title>Original site title here</title><h1>Garden</h1></html>',
      })
      .expect(200);
    r = await request(app)
      .get(`/api/web/report?domain=${input.domain}`)
      .expect(200);
    assert.equal(r.body.audit.source, "submitted-html");
    await request(app)
      .delete(`/api/web/datasets/${r.body.search.id}`)
      .send({ domain: "wrong.example" })
      .expect(404);
    await request(app)
      .delete(`/api/web/datasets/${r.body.search.id}`)
      .send({ domain: input.domain })
      .expect(204);
    assert.deepEqual((await request(app).get("/api/web/domains")).body, [input.domain]);
  } finally {
    db.close();
  }
  assert.throws(
    () =>
      createApp(
        new DatabaseSync(":memory:"),
        undefined,
        undefined,
        undefined,
        undefined,
        { privateOrigin: "https://public.example.com" },
      ),
    /Tailscale/,
  );
});
test(
  "actual Claude Code MCP server imports requested CSV and reads measured reports across restarts",
  { timeout: 20000 },
  async () => {
    const folder = mkdtempSync(join(tmpdir(), "waypoint-web-"));
    const file = join(folder, "web.sqlite");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve("mcp/launch.mjs")],
      env: { PATH: process.env.PATH || "", DATABASE_PATH: file },
      stderr: "pipe",
    });
    const client = new Client({ name: "free-seo-test", version: "1" });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(
        tools.tools.find((t) => t.name === "seo_import")?.annotations
          ?.readOnlyHint,
        false,
      );
      const preview = await client.callTool({
        name: "seo_import_preview",
        arguments: input,
      });
      assert.equal(
        JSON.parse((preview.content as { text: string }[])[0].text).valid,
        true,
      );
      await client.callTool({ name: "seo_import", arguments: input });
      const report = await client.callTool({
        name: "domain_overview",
        arguments: { domain: input.domain },
      });
      const r = JSON.parse((report.content as { text: string }[])[0].text);
      assert.equal(r.totals.clicks, 30);
      assert.equal(r.provenance, "imported");
      const keywords = await client.callTool({
        name: "keyword_research",
        arguments: { domain: input.domain, seed: "balcony" },
      });
      assert.equal(
        JSON.parse((keywords.content as { text: string }[])[0].text).rows
          .length,
        1,
      );
      const workspace = await client.callTool({
        name: "read_workspace",
        arguments: {},
      });
      assert.equal(workspace.isError, undefined);
    } finally {
      await client.close();
    }
    const reopened = new DatabaseSync(file);
    try {
      assert.equal(webReport(reopened, input.domain).totals.clicks, 30);
    } finally {
      reopened.close();
      rmSync(file);
      rmdirSync(folder);
    }
  },
);
