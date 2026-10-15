import type { Analysis, Keyword } from '../shared/types.js';
export interface SeoProvider {
  readonly mode: 'demo';
  overview(domain: string): Analysis;
  keywords(seed: string): Keyword[];
  rank(domain: string, keyword: string, country: string, device: string): number;
}
export function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
export const demoProvider: SeoProvider = {
  mode: 'demo',
  keywords(seed) {
    return ['', ' guide', ' tools', ' for beginners', ' checklist', ' ideas', ' strategy', ' services', ' examples', ' software', ' pricing', ' comparison'].map((suffix, i) => {
      const n = hash(seed + suffix);
      return { keyword: seed + suffix, volume: 100 + n % 24000, difficulty: 12 + n % 78, cpc: (n % 940) / 100, intent: i % 3 === 0 ? 'Informational' : i % 3 === 1 ? 'Commercial' : 'Transactional', position: 1 + n % 60 };
    });
  },
  rank(domain, keyword, country, device) { return 1 + hash([domain, keyword, country, device].join(':')) % 100; },
  overview(domain) {
    const n = hash(domain); const traffic = 18000 + n % 180000;
    const keywords = 1200 + n % 19000;
    const history = Array.from({ length: 12 }, (_, i) => ({ date: `2026-${String(i + 1).padStart(2, '0')}-01`, traffic: Math.round(traffic * (0.53 + i * 0.043 + (hash(domain + i) % 14) / 100)), keywords: Math.round(keywords * (0.5 + i * 0.045)) }));
    return {
      domain, provenance: 'demo', capturedAt: new Date().toISOString(), traffic, keywords,
      backlinks: 8000 + n % 95000, referringDomains: 200 + n % 4000,
      history, topKeywords: this.keywords('sustainable living').slice(0, 6),
      links: ['fieldnotes.example', 'dailygarden.example', 'slowjournal.example', 'designatlas.example', 'thegoodedit.example', 'earthwise.example'].map((source, i) => ({ source, target: `https://${domain}/${i % 2 ? 'journal' : ''}`, anchor: ['a practical guide', domain, 'explore the collection'][i % 3], follow: i % 3 !== 0, strength: 30 + hash(source + domain) % 65 })),
      competitors: ['greenfield.example', 'rootandstem.example', 'everydayearth.example', 'thekindedit.example'].map((name, i) => ({ domain: name, traffic: Math.round(traffic * (0.65 + i * .24)), keywords: Math.round(keywords * (0.7 + i * .2)), overlap: 21 + hash(domain + name) % 60 })),
    };
  },
};
