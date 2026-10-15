# Social SEO module

This document covers the **secondary publishing utilities** retained under the Social SEO dashboard. The main v0.3 feature is now measured keyword/content performance: see [performance data](PERFORMANCE_DATA.md). These publishing utilities do not publish posts, scrape social networks, infer engagement, or provide real-time hashtag trends.

## Sharing audit and metadata builder

Paste HTML and the page URL. The parser reads head metadata, prefers the first property value, and keeps the first image's alternative text with that image. Eight equal-weight checks cover Open Graph title, type, URL, image, description, alt text, page-URL agreement, and an explicit supported X-style layout. The score is a toolkit checklist, not a search/social ranking signal. A type being present does not validate every type-specific property.

Open Graph is based on the [public protocol](https://ogp.me/), including its required properties, optional image alt text, and first-value preference. X-style metadata is supported conservatively with `twitter:` fields and Open Graph fallbacks for illustrative previews. The former X card documentation redirected or was unavailable during verification; the module does not claim current platform validation or pixel-perfect card rendering. Player/app layouts are outside scope. Images, page URLs, dimensions, headers and caches are not fetched or validated. The preview image is explicitly a placeholder.

The builder produces escaped `og:` and `twitter:` meta tags from typed fields. HTTP(S) URLs without credentials are required. No HTML is executed or inserted into the live document. “Use in audit” moves generated markup into the editable audit form; it does not write to your website. Audit JSON and generated HTML can be downloaded locally.

## Caption planner

Review topic placement, the opening 160 characters, repeated normalized Unicode hashtags, a starting target of at most five hashtags, and at least 40 characters of prose. These are transparent editorial heuristics, not platform limits, ranking factors, or reach predictions. Platform selection supplies context for Claude advice; the local heuristics are shared across all platforms. No claims are made that a hashtag is popular or valuable.

## Campaign links

The UTM builder uses standard source, medium, campaign and optional content fields, informed by [Google Analytics' campaign URL documentation](https://support.google.com/analytics/answer/10917952?hl=en). It preserves unrelated query parameters and fragments, replaces existing UTM values, and removes stale `utm_content` when the content field is blank. Values are URL-encoded, case is preserved, and consistency of campaign naming is the user's choice.

Building a link does not create a short URL or collect clicks. The destination's own analytics must collect visits for attribution. Inputs and results live in browser memory and are not stored in SQLite; download them before leaving the module.

## Claude assistance

Claude is now an optional platform integration, off by default. Enable it under Integrations to analyze the selected performance context explicitly. No API key means an honest setup state, not simulated advice. See [Claude setup](CLAUDE.md) and [whole-platform plugin options](PLUGIN.md).
