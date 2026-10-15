# Measured social performance

Social SEO is now a performance workspace. It provides overview trends, query-level metrics, topic-associated content, similar-post comparisons, account benchmarks and optional live public YouTube research. The former sharing checks remain secondary publishing utilities.

## Data-source choices

| Platform | CSV / normalized JSON ingestion | Native integration in this release |
| --- | --- | --- |
| YouTube | Yes | Public keyword discovery + video statistics using your API key |
| Instagram, TikTok, LinkedIn, Facebook, X, Pinterest, Threads | Yes | Direct account OAuth/sync not implemented |

Import only observations you obtained legitimately from exports, authorized APIs or public sources. Private competitor metrics are not available merely because a competitor account exists. A JSON ingestion endpoint is a data path for **your existing authorized API workflow**, not a claim that Waypoint already implements each platform's OAuth client.

The default **My data** workspace starts empty. No search term produces invented performance. Explicit **Explore example** selects a separate in-memory fictional dataset, with prominent labels. It is never saved as imported data. The query string `?dataset=example#social-seo` opens that labeled review mode.

## Daily content CSV

Download a template from the Import dialog and map your export to its headers. This release validates a common schema; it does not automatically interpret every vendor's export layout.

Required columns: `platform,account,content_id,date,published_at,title,format,ownership`. Optional text columns: `caption,keywords,url`. Metric columns: `views,impressions,clicks,likes,comments,shares,saves`. At least one metric must be supplied; blank/omitted metrics remain **null/unknown**, while an explicit `0` means measured zero. Metric values are nonnegative safe integers, without percent signs or thousands separators. Quoted commas and multiline text are supported. Content URLs must be HTTP(S) without credentials, or blank.

- `platform`: `youtube`, `instagram`, `tiktok`, `linkedin`, `facebook`, `x`, `pinterest`, `threads`.
- `date`: the observation day; `published_at`: content publication day, both real calendar dates in YYYY-MM-DD form.
- `ownership`: `owned` or `competitor`, supplied by you.
- `content_id`: stable platform-specific content identifier; identity includes platform and account.
- `keywords`: your explicit topic tags separated by `|`. Topics can overlap.
- `format`: your consistent label such as `video`, `short video`, `carousel`, `post`, or `pin`.

Each metric must be a **daily increment**, not a lifetime snapshot or an entire date-range total repeated on each day. If your export contains cumulative totals, transform it correctly before importing; do not confirm daily basis otherwise. Native public YouTube results remain separate because they are lifetime counters.

Validate & preview before importing. The whole file must pass validation before an atomic transaction runs. Reimporting the same platform/account/content/day replaces that observation rather than adding it twice. Duplicate identities within a single file are rejected. Up to 10,000 rows / 900 KB CSV / 1 MB JSON body per import; local analysis supports up to 100,000 observations in each dataset. Oversized analyses fail explicitly rather than silently truncating.

## Search-query CSV

Required headers: `platform,account,date,keyword`. Optional metrics: `views,impressions,clicks`, with at least one known metric. Import query rows only if your source actually reports query-level data. If the source doesn't provide keyword impressions/clicks, leave them unknown—post views are not a substitute.

Identity: platform + account + day + case-normalized keyword. Reimports replace the same observation. Query CTR is `sum(clicks) / sum(impressions) × 100`, using only rows that contain both fields; no denominator or zero denominator produces unknown CTR. Query impressions can therefore include other rows that are not eligible for CTR, and coverage/history are preserved.

## Analysis and comparisons

- Default window: the latest 14 days ending at the last observation in the selected data/filter. Explicit date ranges are limited to 366 days. This is not assumed to be the current calendar fortnight.
- Metric totals sum only known observations. Daily chart gaps remain unknown.
- Headline totals include **all owned and competitor accounts** in the current platform/keyword selection; account benchmarks show their contributions separately.
- Previous period is the preceding equal-length window. Percentage changes require complete day coverage and no missing rows for the relevant metric in both windows. They still depend on the completeness and definitions of your supplied data; matching coverage does not authenticate the dataset.
- Engagement/views is `(likes + comments + shares + saves) / views × 100`, using only daily rows with all four interaction fields and views. It is an explicitly defined toolkit rate, not a vendor's reach/follower engagement formula. Rates remain unknown for zero or unavailable denominators; coverage counts are shown.
- Format ranking uses median per-content views within the selected period, sorted descending. Publication age and observation coverage may differ.
- Topic totals sum full views for posts tagged with each topic. Overlapping topics must not be added together as unique traffic. These are content associations, not query demand or causal keyword attribution.
- Similar content uses lexical Jaccard overlap of normalized title/topic terms after common stop-word removal. It is not a semantic/video embedding or plagiarism score. Same-platform matching is default; all-platform comparison is optional and directional. Reported performance differences are observed totals, with days shown.

Metric definitions can differ across platforms. Filter to one platform when assessing close comparisons. Imported data is user-supplied; Waypoint has not independently verified it. Original exports should be preserved for auditability.

## Ingestion API

Your authorized local pipeline can call `POST /api/social/ingest` with:

```json
{
  "kind": "content",
  "metricBasis": "daily",
  "rows": [{
    "platform": "youtube", "account": "@mychannel", "content_id": "video-001",
    "date": "2026-10-15", "published_at": "2026-10-01", "title": "Balcony garden guide",
    "format": "video", "ownership": "owned", "keywords": "balcony garden", "views": 120
  }]
}
```

Use `kind: queries` with query fields for search data. Unknown metrics can be omitted or set to null. The same validation, transaction and replacement rules apply. This endpoint is local/loopback only and has no production authentication; do not expose it publicly.

## Native YouTube discovery

Set `YOUTUBE_API_KEY` in the server's ignored `.env`, enable the YouTube Data API for that key, restart the server and open **Live research**. Requests call the fixed official `search.list` and `videos.list` endpoints. Searches return a bounded sample (up to 12 videos), ordered by relevance, view count or recency. Provider requests consume quota and are rate-limited locally.

Results show public lifetime views, likes, comments, publication date and lifetime views per day of age (minimum one day). Missing counters remain unknown. This is **not** keyword search volume, a comprehensive SERP index, daily growth, private impressions, retention, or competitor reach. Native account authorization/private Analytics API sync is not implemented here. The live adapter was tested with mocked official response shapes; a live call requires your own configured key.

Primary references: [YouTube search.list](https://developers.google.com/youtube/v3/docs/search/list), [YouTube videos.list](https://developers.google.com/youtube/v3/docs/videos/list), [YouTube Analytics metric definitions](https://developers.google.com/youtube/analytics/metrics).

## Storage and exports

Observations persist in ignored local SQLite tables `social_observations` and `social_queries`; complete parsed row payloads include captions/topic tags. The main dataset is workspace-wide, independent of the web-domain toolbar. Social JSON reports contain source selection, dates, totals, comparisons, query history, coverage and analysis limitations. No posting or messages are sent. Claude analysis is optional under Integrations; the plugin provides read-only access to this same data when pointed at the same database.
