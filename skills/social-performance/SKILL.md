---
name: social-performance
description: Analyze social keyword performance, similar content, account benchmarks and trends with Waypoint when users ask which topics or posts perform best.
---

Use Waypoint's social_performance, social_keywords and similar_content tools to inspect measured observations. Start with imported data and the requested platform/date/keyword filters. If no data exists, report that fact and explain the CSV or normalized JSON ingestion options. Use example data only when the user explicitly asks for an example and label it fictional.

Distinguish supplied query-level impressions/clicks/CTR from full post views associated with topic tags. Do not label topic totals as keyword demand or infer causal effects from associations. Show missing metrics as unknown and include coverage, observation dates, platform definitions and comparison limitations. Compare within the same platform by default. Explain that similarity is lexical title/tag overlap, not an embedding or plagiarism score.

Use native YouTube discovery only if it is explicitly requested and configured; public counters are lifetime observations, not private channel analytics. Never invent unavailable social performance, search volume, trends, reach or competitor data. Do not publish content or change account settings.

For saved native account data, call `social_api_snapshots` with platform/topic filters. These are lifetime counters and capture dates, never daily increments or measured keyword demand. Read run warnings and preserve unknowns. Native pulls remain explicit app actions; this plugin does not initiate them.
