import { z } from 'zod';
import type { YouTubeResearch } from '../shared/performance.js';
export class YouTubeError extends Error { constructor(public status: number, message: string) { super(message); } }
export const youtubeInput = z.object({ keyword: z.string().trim().min(2).max(150), sort: z.enum(['relevance', 'viewCount', 'date']).default('relevance') });
export function createYouTubeProvider(options: { apiKey?: string; fetch?: typeof fetch } = {}) {
  const key = options.apiKey?.trim(); const fetcher = options.fetch || fetch; let lastRequest = 0; let active = false;
  async function get(endpoint: 'search' | 'videos', parameters: Record<string, string>) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.search = new URLSearchParams({ ...parameters, key: key! }).toString();
    const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new YouTubeError(response.status === 429 ? 429 : 502, 'YouTube rejected the request. Check API access, quota, and key restrictions.');
    return response.json();
  }
  return {
    status: () => ({ configured: Boolean(key), provider: 'youtube-data-api', capabilities: ['public-keyword-discovery', 'public-video-statistics'], notes: 'Public video totals are lifetime snapshots, not keyword search volume or private analytics.' }),
    async research(input: z.input<typeof youtubeInput>): Promise<YouTubeResearch> {
      const { keyword, sort } = youtubeInput.parse(input);
      if (!key) throw new YouTubeError(503, 'Configure YOUTUBE_API_KEY on the server and restart to enable native YouTube research.');
      if (active || Date.now() - lastRequest < 5000) throw new YouTubeError(429, 'Please wait before another YouTube search.');
      active = true; lastRequest = Date.now();
      try {
        const search = await get('search', { part: 'snippet', type: 'video', q: keyword, order: sort, maxResults: '12' });
        const ids = (search.items || []).map((item: { id?: { videoId?: string } }) => item.id?.videoId).filter(Boolean);
        const videos = ids.length ? await get('videos', { part: 'snippet,statistics', id: ids.join(',') }) : { items: [] };
        const count = (value: unknown) => typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
        const results = (videos.items || []).map((video: { id: string; snippet: { title: string; channelTitle: string; publishedAt: string }; statistics?: Record<string, string> }) => {
          const daysOld = Math.max(1, Math.floor((Date.now() - Date.parse(video.snippet.publishedAt)) / 86400000)); const views = count(video.statistics?.viewCount);
          return { id: video.id, title: video.snippet.title, channel: video.snippet.channelTitle, publishedAt: video.snippet.publishedAt, views, likes: count(video.statistics?.likeCount), comments: count(video.statistics?.commentCount), daysOld, viewsPerDay: views === null ? null : Math.round(views / daysOld), url: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}` };
        });
        return { source: 'youtube-data-api', keyword, collectedAt: new Date().toISOString(), results, disclosure: 'Live public lifetime counters for videos returned by YouTube search. Results are a sample, not search volume, a complete market index, or causal evidence of keyword performance. Views/day is lifetime views divided by age (minimum one day). Private impressions, saves and retention are unavailable here.' };
      } catch (error) { if (error instanceof YouTubeError) throw error; throw new YouTubeError(502, 'Could not reach YouTube. Check connectivity and API configuration.'); }
      finally { active = false; }
    },
  };
}
export type YouTubeProvider = ReturnType<typeof createYouTubeProvider>;
