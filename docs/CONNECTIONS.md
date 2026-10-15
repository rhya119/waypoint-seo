# Native social data pulls

Open **Integrations → Connect your social accounts**. Each platform card shows its required server environment names and account permissions. Create/authorize your own provider app, put the credentials in the ignored `.env`, restart `npm run dev`, click **Refresh connection status**, then **Pull recent posts**. No credentials are entered into the browser or committed to GitHub. Configuration presence does not verify access; a successful pull does.

Open **Social SEO → API snapshots** to see saved results. Select a platform or type a topic in the title/caption filter. Click **Find similar** on a post to compare same-platform word overlap, or **Export** to download the source-aware snapshot report. The daily workspace's date/source filters apply only to daily imports; the snapshot panel has its own filters. Pull history records partial-coverage warnings and capture times.

## Account setup and metrics

| Platform | Server settings | Account access | Captured counters |
| --- | --- | --- | --- |
| Instagram | `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `META_GRAPH_VERSION` | Instagram Login professional business/creator; `instagram_business_basic`, `instagram_business_manage_insights` | Likes/comments; media insights views, saved, shares when available |
| TikTok | `TIKTOK_ACCESS_TOKEN`, `TIKTOK_OPEN_ID` | Display API user token with `video.list`; use the `open_id` from that token's OAuth response as the account identity | Public authorized-user videos: views, likes, comments, shares |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORGANIZATION_ID`, `LINKEDIN_VERSION` | Organization numeric ID, admin role and approved Community Management access; `r_organization_social` and statistics permissions such as `rw_organization_admin` | Per-post lifetime impressions, clicks, likes, comments, shares |
| Facebook | `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, `META_GRAPH_VERSION` | Page token, numeric Page ID, `pages_read_engagement` and any extra provider app-review requirements | Published Page post likes, comments, shares; views/impressions are not requested |
| X | `X_BEARER_TOKEN`, `X_USER_ID` | Numeric user ID; developer timeline access, sufficient credits/tier; user OAuth requires appropriate `tweet.read`/`users.read` scopes | Public likes, replies, retweets, bookmarks, impressions when returned |
| Pinterest | `PINTEREST_ACCESS_TOKEN`, `PINTEREST_ACCOUNT` | Approved app, `boards:read`/`pins:read`, business analytics access where required; set account to the matching stable username/ID | `lifetime_metrics.impression` and `pin_click` only; 90-day counters excluded |
| Threads | `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID` | Numeric Threads user ID, `threads_basic`, `threads_manage_insights` | Post views, likes, replies, shares when insights are available |

Pin `META_GRAPH_VERSION` to a version supported by your registered Meta apps (`vNN.0`); pin `LINKEDIN_VERSION` to a supported `YYYYMM` release. Neither defaults to an unverified latest version. Instagram uses **Instagram Login** tokens on `graph.instagram.com`, not Facebook Login tokens. LinkedIn supports organization Pages, not personal-profile analytics. Facebook supports Pages, not personal timelines or groups. These adapters do not publish, edit or delete posts.

Each connector uses one authorized account per local environment. Keep TikTok open ID and Pinterest account identity paired with the correct token. To change accounts, update both and restart. Provider approval, token issuance/refresh, billing and scopes are managed through the providers. An embedded OAuth login/refresh service and multiple-account credential vault are future work.

## Metric meaning and limits

- Snapshots are **lifetime counters at the capture time**, stored separately in `social_snapshots` and `social_pull_runs`. Repeat pulls retain history but show only the latest capture per platform/account/post. Old posts outside a recent sample retain their earlier capture dates. There is no derived daily growth or summed-across-pulls total.
- Replies map to comments for X/Threads. X retweets map to shares; quote counts are excluded. Threads shares use its `shares` metric; reposts/quotes are not added. Facebook uses the LIKE reaction only, not all reactions. Pinterest Pin clicks are not outbound clicks, and reactions are not relabeled as likes. Views and impressions are separate metrics.
- Unsupported/unavailable counters stay `null` (shown as `—`), including age/format-dependent Instagram insights and pre-2023 Pinterest lifetime gaps. Optional insights returning permission/unsupported-metric errors produce an explicit warning while preserving available post counters. Authentication failures, rate limits and core list failures abort the pull. Raw upstream error bodies and token-bearing URLs are never returned to clients.
- These account endpoints do **not** supply measured keyword search demand. Snapshot topic filtering and similarity are lexical title/caption matches. For actual query clicks, impressions and CTR, import authorized search-query exports in the daily workspace. Different content ages, platforms and capture times limit comparisons.
- Manual pulls request at most 50 posts across at most three list pages, with a 90-second overall deadline and 12-second request timeouts. Ten-second local cooldown, one active pull per platform, no retries, no background polling. Provider API quota/charges still apply. A truncated response is labeled a recent-post sample. Unsupported cursors stop with warnings. Provider `next` URLs are never fetched; opaque cursors are applied to fixed official endpoints only.
- Successful pulls are saved atomically. There is no account-wide reconciliation/deletion scan: removed/private posts from earlier pulls can remain in local capture history. Local snapshot reports cap at 1,000 latest posts and 20 recent runs; narrow by platform if needed. Database retention/pruning is future work.

## Local API and Claude

`POST /api/social/pull/:platform` with `{ "maxPosts": 20 }` runs a manual official API pull and saves a capture. Platforms are the seven names above, lowercase. `GET /api/social/snapshots?platform=all&keyword=garden` reads latest saved counters and pull warnings. Both use the existing loopback host/origin protections; this is not an authenticated public service.

The optional Claude plugin adds **`social_api_snapshots`**, a read-only local tool with `platform` and `keyword` filters. It reads saved data without pulling or spending provider quota. Pulls remain explicit actions in Waypoint. No social credentials are returned through MCP. The in-app Claude advisor is a separate opt-in feature.

## Official references

- [Meta's official Instagram workspace](https://www.postman.com/meta/instagram/overview) and [Instagram Login insights](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/insights/).
- [TikTok List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list) and [Video Object](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object).
- [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) and [organization share statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics).
- [Facebook published Page posts](https://developers.facebook.com/docs/graph-api/reference/page/published_posts/).
- [X user posts](https://docs.x.com/x-api/users/get-posts).
- [Pinterest List Pins](https://developers.pinterest.com/docs/api/v5/pins-list/) and [organic reporting](https://developers.pinterest.com/docs/analytics-and-reports/organic-reporting/).
- [Meta's official Threads workspace](https://www.postman.com/meta/threads/overview) and [post insights reference](https://www.postman.com/meta/threads/request/ndeeu6p/get-post-insights).

Contract verification uses recorded-shaped synthetic fixtures and injected HTTP transports. Real account requests require configured provider tokens and account approvals; fixture success is not proof that a particular account has access.
