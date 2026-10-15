export type Keyword = { keyword: string; volume: number; difficulty: number; cpc: number; intent: 'Informational' | 'Commercial' | 'Transactional'; position: number };
export type Backlink = { source: string; target: string; anchor: string; follow: boolean; strength: number };
export type Competitor = { domain: string; traffic: number; keywords: number; overlap: number };
export type Analysis = {
  domain: string; provenance: 'demo'; capturedAt: string;
  traffic: number; keywords: number; backlinks: number; referringDomains: number;
  history: { date: string; traffic: number; keywords: number }[];
  topKeywords: Keyword[]; links: Backlink[]; competitors: Competitor[];
};
export type Project = { id: number; domain: string; created_at: string };
export type Rank = { id: number; project_id: number; keyword: string; country: string; device: string; position: number; previous: number; checked_at: string; provenance: 'demo' };
export type Audit = { score: number; checks: { name: string; passed: boolean; detail: string; severity: 'error' | 'warning' }[]; source: 'submitted-html'; checkedAt: string };
