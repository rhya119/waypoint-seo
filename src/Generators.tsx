import { useMemo, useState } from 'react';
import { Copy, Download, Plus, Trash2 } from 'lucide-react';
import type { SiteScan } from '../shared/site-scan';
import { download } from './lib';

const brandFrom = (site: SiteScan) => (site.openGraph.title || site.title || site.domain).split(/\s[|–—-]\s/)[0].trim().slice(0, 80);

export function buildLlmsTxt(site: SiteScan, name: string, summary: string) {
  const pages = (site.pageChecks || []).filter((page) => !page.error && page.status && page.status < 300);
  const line = (page: typeof pages[number]) => `- [${(page.title || page.url).replace(/[[\]]/g, '').slice(0, 90)}](${page.url})${page.description ? `: ${page.description.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`;
  const main = pages.filter((page) => (page.depth ?? 0) <= 1);
  const more = pages.filter((page) => (page.depth ?? 0) > 1);
  return [`# ${name}`, '', `> ${summary}`, '', '## Main pages', '', ...main.map(line), ...(more.length ? ['', '## Optional', '', ...more.map(line)] : []), ''].join('\n');
}

export function buildSchema(fields: { type: string; name: string; url: string; logo: string; description: string; phone: string; email: string; street: string; city: string; country: string; sameAs: string; faqs: { q: string; a: string }[] }) {
  const org: Record<string, unknown> = { '@type': fields.type, '@id': `${fields.url}#organization`, name: fields.name, url: fields.url };
  if (fields.logo) org.logo = fields.logo;
  if (fields.description) org.description = fields.description;
  if (fields.phone) org.telephone = fields.phone;
  if (fields.email) org.email = fields.email;
  if (fields.street || fields.city || fields.country) org.address = { '@type': 'PostalAddress', ...(fields.street && { streetAddress: fields.street }), ...(fields.city && { addressLocality: fields.city }), ...(fields.country && { addressCountry: fields.country }) };
  const sameAs = fields.sameAs.split(/\s+/).filter((value) => /^https:\/\//.test(value));
  if (sameAs.length) org.sameAs = sameAs;
  const graph: Record<string, unknown>[] = [org, { '@type': 'WebSite', '@id': `${fields.url}#website`, url: fields.url, name: fields.name, publisher: { '@id': `${fields.url}#organization` } }];
  const faqs = fields.faqs.filter((faq) => faq.q.trim() && faq.a.trim());
  if (faqs.length) graph.push({ '@type': 'FAQPage', mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.q.trim(), acceptedAnswer: { '@type': 'Answer', text: faq.a.trim() } })) });
  // Escape "<" so the JSON cannot close the script element it is pasted into.
  return `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c')}\n</script>`;
}

function Output({ text, file, type }: { text: string; file: string; type: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="gen-output">
    <pre>{text}</pre>
    <div className="web-toolbar">
      <button className="button secondary" onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined)}><Copy size={14} />{copied ? 'Copied' : 'Copy'}</button>
      <button className="text-button" onClick={() => download(file, text, type)}><Download size={14} /> Download {file}</button>
    </div>
  </div>;
}

export default function Generators({ site }: { site: SiteScan }) {
  const [name, setName] = useState(() => brandFrom(site));
  const [summary, setSummary] = useState(site.description || '');
  const [fields, setFields] = useState({ type: 'Organization', logo: '', phone: '', email: '', street: '', city: '', country: '', sameAs: '' });
  const [faqs, setFaqs] = useState([{ q: '', a: '' }]);
  const origin = new URL(site.finalUrl).origin + '/';
  const llms = useMemo(() => buildLlmsTxt(site, name || site.domain, summary || `Official website of ${name || site.domain}.`), [site, name, summary]);
  const schema = useMemo(() => buildSchema({ ...fields, name: name || site.domain, url: origin, description: summary, faqs }), [fields, name, summary, faqs, origin, site.domain]);
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) => setFields((current) => ({ ...current, [key]: event.target.value }));
  return <div className="generators">
    <h4 className="health-subhead">Fix it: ready-to-paste files</h4>
    <div className="gen-fields">
      <label>Business name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
      <label>One-line summary<input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={300} placeholder="What you offer and who it is for" /></label>
    </div>
    <details className="web-details gen-block">
      <summary>llms.txt — a map of your site for AI tools {site.llms?.found ? '(you already have one)' : ''}</summary>
      <p className="web-help">Built from the {site.pageChecks?.filter((page) => !page.error).length || 0} pages crawled. Upload it as <code>{origin}llms.txt</code>.</p>
      <Output text={llms} file="llms.txt" type="text/plain" />
    </details>
    <details className="web-details gen-block">
      <summary>Structured data (JSON-LD) — business, website and FAQ</summary>
      <div className="gen-fields">
        <label>Type<select value={fields.type} onChange={set('type')}>{['Organization', 'LocalBusiness', 'Store', 'OnlineStore', 'ProfessionalService', 'Restaurant'].map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Logo URL<input value={fields.logo} onChange={set('logo')} placeholder="https://…/logo.png" /></label>
        <label>Phone<input value={fields.phone} onChange={set('phone')} /></label>
        <label>Email<input value={fields.email} onChange={set('email')} /></label>
        <label>Street address<input value={fields.street} onChange={set('street')} /></label>
        <label>City<input value={fields.city} onChange={set('city')} /></label>
        <label>Country code<input value={fields.country} onChange={set('country')} placeholder="NZ" maxLength={2} /></label>
        <label className="wide">Social profile URLs<input value={fields.sameAs} onChange={set('sameAs')} placeholder="https://facebook.com/… https://instagram.com/…" /></label>
      </div>
      <div className="gen-faqs">
        <strong>FAQ (optional)</strong>
        {faqs.map((faq, index) => <div key={index} className="gen-faq">
          <input aria-label={`Question ${index + 1}`} value={faq.q} placeholder="Question customers ask" onChange={(event) => setFaqs(faqs.map((item, i) => i === index ? { ...item, q: event.target.value } : item))} />
          <textarea aria-label={`Answer ${index + 1}`} value={faq.a} placeholder="Direct answer in 40–60 words" onChange={(event) => setFaqs(faqs.map((item, i) => i === index ? { ...item, a: event.target.value } : item))} />
          {faqs.length > 1 && <button className="icon-button" aria-label="Remove question" onClick={() => setFaqs(faqs.filter((_, i) => i !== index))}><Trash2 size={14} /></button>}
        </div>)}
        {faqs.length < 10 && <button className="text-button" onClick={() => setFaqs([...faqs, { q: '', a: '' }])}><Plus size={14} /> Add question</button>}
      </div>
      <p className="web-help">Paste into the &lt;head&gt; of your homepage, then check it with Google’s Rich Results Test. Only mark up FAQs that also appear on the page.</p>
      <Output text={schema} file="schema.html" type="text/html" />
    </details>
  </div>;
}
