import { useEffect, useState } from 'react';
import { CircleHelp, Compass, FileChartColumn, LayoutDashboard, Link2, Plug, Radar, Search, Share2, ShieldCheck, Target, X } from 'lucide-react';
import { api } from './lib';
import SocialSeo from './SocialSeo';
import Integrations from './Integrations';
import GuidedTour from './GuidedTour';
import WebWorkspace from './WebWorkspace';
import './workspace-shell.css';

const pages = [
  { name:'Domain overview', label:'Overview', icon:LayoutDashboard, caption:'Your website and the next steps to improve it.' },
  { name:'Keyword research', label:'Keywords', icon:Search, caption:'Find what people search for and your quickest wins.' },
  { name:'Backlink analysis', label:'Links', icon:Link2, caption:'Review page links and the backlinks you have supplied.' },
  { name:'Site audit', label:'Site health', icon:ShieldCheck, caption:'Crawl issues, AI search readiness and page speed.' },
  { name:'Rank tracking', label:'Rankings', icon:Target, caption:'Follow your keywords and saved ranking observations.' },
  { name:'Competitor research', label:'Compare sites', icon:Radar, caption:'Compare public pages and compatible keyword data.' },
  { name:'Reports', label:'Reports', icon:FileChartColumn, caption:'Save a clear report with its sources and dates.' },
  { name:'Social SEO', label:'Social', icon:Share2, caption:'See which keywords, posts and accounts perform.' },
  { name:'Integrations', label:'Connections', icon:Plug, caption:'Connect your data and use Waypoint with Claude.' },
];
const slug = (index:number) => pages[index].name.toLowerCase().replaceAll(' ','-');
export default function App() {
  const [page,setPage] = useState(() => Math.max(0,pages.findIndex((_,i)=>slug(i)===location.hash.slice(1))));
  const [domain,setDomain] = useState(() => {try{return localStorage.getItem('waypoint-own-domain')||'';}catch{return '';}});
  const [claudeEnabled,setClaudeEnabled] = useState(false);
  const [tourOpen,setTourOpen] = useState(false);
  const [welcome,setWelcome] = useState(() => {try{return localStorage.getItem('waypoint-tour-v2')!=='seen';}catch{return true;}});
  function chooseDomain(value:string) {setDomain(value);try{localStorage.setItem('waypoint-own-domain',value);}catch{}}
  function navigate(index:number) {setPage(index);location.hash=slug(index);}
  function dismissWelcome() {setWelcome(false);try{localStorage.setItem('waypoint-tour-v2','seen');}catch{}}
  function closeTour() {setTourOpen(false);dismissWelcome();}
  useEffect(()=>{const update=()=>{const index=pages.findIndex((_,i)=>slug(i)===location.hash.slice(1));if(index>=0)setPage(index);};addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
  useEffect(()=>{document.querySelector('nav button[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[page]);
  useEffect(()=>{api<{claude:{enabled:boolean}}>('/integrations').then(r=>setClaudeEnabled(r.claude.enabled)).catch(()=>{});},[]);
  return <div className="app-shell simple-shell" data-page={pages[page].name}>
    <aside className="sidebar">
      <a className="brand" href="#domain-overview" onClick={()=>navigate(0)}><span className="brand-mark"><Compass size={26}/></span>waypoint<span className="brand-dot">.</span></a>
      <div className="nav-label">YOUR TOOLKIT</div>
      <nav aria-label="Main navigation">{pages.map((p,i)=><button key={p.name} data-tour={`nav-${i}`} onClick={()=>navigate(i)} className={page===i?'active':''} aria-current={page===i?'page':undefined}><p.icon size={18}/>{p.label}</button>)}</nav>
      <div className="sidebar-bottom"><button className="help-button" onClick={()=>setTourOpen(true)}><CircleHelp size={17}/>Quick guide</button><div className="private-label"><span className="status-dot"/>Private workspace{domain && <small title={domain}>{domain}</small>}</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span>Workspace</span><span>/</span><strong>{pages[page].label}</strong></div><div className="topbar-right"><button className="tour-start" onClick={()=>setTourOpen(true)}><CircleHelp size={16}/>Quick guide</button>{page!==8 && <button onClick={()=>navigate(8)}><Plug size={16}/>Connections</button>}</div></header>
      <main>
        <div className="page-heading"><div><h1>{pages[page].label}</h1><p>{pages[page].caption}</p></div></div>
        {welcome && !tourOpen && !domain && page===0 && <div className="welcome-strip"><span>Start with a website below. Your results stay in this workspace.</span><button className="text-button" onClick={()=>setTourOpen(true)}>Show me how</button><button className="icon-button" aria-label="Dismiss introduction" onClick={dismissWelcome}><X size={16}/></button></div>}
        {page<7 && <WebWorkspace page={page} domain={domain} onDomain={chooseDomain} onIntegrations={()=>navigate(8)}/>}
        {page===7 && <SocialSeo domain={domain} claudeEnabled={claudeEnabled} onIntegrations={()=>navigate(8)}/>}
        {page===8 && <Integrations onClaudeChange={setClaudeEnabled}/>}
        <footer><span><Compass size={13}/>Waypoint · Private SEO toolkit</span><span>v0.6.0</span></footer>
      </main>
    </div>
    {tourOpen && <GuidedTour page={page} navigate={navigate} onClose={closeTour}/>}
  </div>;
}

