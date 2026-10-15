import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  FileChartColumn,
  LayoutDashboard,
  Link2,
  Plug,
  Radar,
  Search,
  Share2,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { api } from "./lib";
import SocialSeo from "./SocialSeo";
import Integrations from "./Integrations";
import GuidedTour from "./GuidedTour";
import WebWorkspace from "./WebWorkspace";
const pages = [
  {
    name: "Domain overview",
    icon: LayoutDashboard,
    caption: "Public website findings, traffic and search performance in one place.",
  },
  {
    name: "Keyword research",
    icon: Search,
    caption:
      "Explore observed search queries, clicks, impressions and average positions.",
  },
  {
    name: "Backlink analysis",
    icon: Link2,
    caption: "Inspect your supplied source links, targets and anchors.",
  },
  {
    name: "Site audit",
    icon: ShieldCheck,
    caption: "Scan your public pages and find markup issues to fix.",
  },
  {
    name: "Rank tracking",
    icon: Target,
    caption: "Keep your manually observed positions and watchlist together.",
  },
  {
    name: "Competitor research",
    icon: Radar,
    caption: "Compare authorized domain datasets with matching coverage.",
  },
  {
    name: "Reports",
    icon: FileChartColumn,
    caption: "Export a report with your measured results and source details.",
  },
  {
    name: "Social SEO",
    icon: Share2,
    caption:
      "Keyword performance, content comparisons, and account intelligence.",
  },
  {
    name: "Integrations",
    icon: Plug,
    caption: "Data connections and your Claude Code subscription workflow.",
  },
];
export default function App() {
  const [page, setPage] = useState(() => {
    const found = pages.findIndex(
      (p) =>
        p.name.toLowerCase().replaceAll(" ", "-") === location.hash.slice(1),
    );
    return found < 0 ? 0 : found;
  });
  const [domain, setDomain] = useState(() => {
    try {
      return localStorage.getItem("waypoint-own-domain") || "";
    } catch {
      return "";
    }
  });
  const [claudeEnabled, setClaudeEnabled] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      return localStorage.getItem("waypoint-tour-v1") !== "seen";
    } catch {
      return true;
    }
  });
  const [help, setHelp] = useState(false);
  function chooseDomain(value: string) {
    setDomain(value);
    try {
      localStorage.setItem("waypoint-own-domain", value);
    } catch {}
  }
  function closeTour() {
    setTourOpen(false);
    setShowWelcome(false);
    try {
      localStorage.setItem("waypoint-tour-v1", "seen");
    } catch {}
  }
  function navigate(index: number) {
    setPage(index);
    location.hash = pages[index].name.toLowerCase().replaceAll(" ", "-");
  }
  useEffect(() => {
    const handler = () => {
      const index = pages.findIndex(
        (p) =>
          p.name.toLowerCase().replaceAll(" ", "-") === location.hash.slice(1),
      );
      if (index >= 0) setPage(index);
    };
    addEventListener("hashchange", handler);
    return () => removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document
      .querySelector('nav button[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [page]);
  useEffect(() => {
    api<{ claude: { enabled: boolean } }>("/integrations")
      .then((r) => setClaudeEnabled(r.claude.enabled))
      .catch(() => {});
  }, []);
  return (
    <div className="app-shell" data-page={pages[page].name}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#domain-overview"
          onClick={() => navigate(0)}
        >
          <span className="brand-mark">
            <Compass size={25} />
          </span>
          waypoint<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">W</span>
          <div>
            <strong>My workspace</strong>
            <small>Private SEO tools</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">SEARCH INTELLIGENCE</div>
        <nav aria-label="Main navigation">
          {pages.map((p, i) => (
            <button
              key={p.name}
              data-tour={`nav-${i}`}
              onClick={() => navigate(i)}
              className={page === i ? "active" : ""}
              aria-current={page === i ? "page" : undefined}
            >
              <p.icon size={18} />
              {p.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="mini-spark">
            <Compass size={17} />
          </span>
          <h3>
            Your data.
            <br />
            Useful decisions.
          </h3>
          <p>
            Scan websites, connect performance data, and investigate what the
            evidence shows.
          </p>
          <button
            onClick={() => {
              setHelp(false);
              setTourOpen(true);
            }}
          >
            Explore your toolkit <ArrowRight size={14} />
          </button>
        </div>
        <button className="help-button" onClick={() => setHelp(true)}>
          <CircleHelp size={17} />
          How this workspace works
        </button>
        <div className="profile">
          <span>W</span>
          <div>
            <strong>My research</strong>
            <small>Private workspace</small>
          </div>
          <span className="status-dot" />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            Workspace <span>/</span> <strong>{pages[page].name}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-dot" />
            <span className="workspace-status">
            {page < 7
              ? "Your data / free tools"
              : "Private performance workspace"}
            </span>
            <span className="divider" />
            <button onClick={() => navigate(8)}>
              <Plug size={15} />
              Integrations
            </button>
            <button
              className="tour-start"
              onClick={() => {
                setHelp(false);
                setTourOpen(true);
              }}
            >
              <Compass size={15} />
              Take a tour
            </button>
            <button aria-label="Help" onClick={() => setHelp(true)}>
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main>
          {showWelcome && !tourOpen && (
            <section className="tour-welcome">
              <div>
                <strong>Welcome to Waypoint.</strong>
                <p>
                  Enter a website to scan its public pages. Add traffic data
                  with connections or imports. The tour points to the controls.
                </p>
              </div>
              <div>
                <button
                  className="button primary"
                  onClick={() => setTourOpen(true)}
                >
                  Start guided tour <ArrowRight size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Dismiss introduction"
                  onClick={closeTour}
                >
                  <X size={16} />
                </button>
              </div>
            </section>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR PRIVATE SEO WORKSPACE</div>
              <h1>{pages[page].name}</h1>
              <p>{pages[page].caption}</p>
            </div>
            <button className="button secondary" onClick={() => navigate(6)}>
              <ArrowDownToLine size={16} />
              Create report
            </button>
          </div>
          {page < 7 && (
            <WebWorkspace
              page={page}
              domain={domain}
              onDomain={chooseDomain}
              onIntegrations={() => navigate(8)}
            />
          )}
          {page === 7 && (
            <SocialSeo
              domain={domain}
              claudeEnabled={claudeEnabled}
              onIntegrations={() => navigate(8)}
            />
          )}
          {page === 8 && <Integrations onClaudeChange={setClaudeEnabled} />}
          <footer>
            <span>
              <Compass size={13} />
              waypoint <span>Independent tools. Clearer decisions.</span>
            </span>
            <span>
              Search + social intelligence <span className="tiny-dot" /> v0.5.0
            </span>
          </footer>
        </main>
      </div>
      {tourOpen && (
        <GuidedTour page={page} navigate={navigate} onClose={closeTour} />
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            className="modal"
          >
            <button
              className="modal-close icon-button"
              autoFocus
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <Compass size={36} />
            <h2 id="help-title">Start with your website and data.</h2>
            <p>
              Enter your domain and click Analyze website. It scans the homepage
              and up to two internal pages for metadata, topics, links and
              markup issues. Add authorized Google data for actual traffic and
              search performance, or use optional Similarweb estimates for other
              sites. You can also import query, backlink and ranking CSVs.
            </p>
            <p>
              Social SEO uses your imports or configured account pulls. Use
              Start-Claude-SEO.cmd on the host computer to work with the toolkit
              through your Claude Code subscription. Claude can analyze the
              available evidence; private analytics still require property
              access and third-party estimates require a configured provider.
            </p>
            <button
              className="button primary"
              onClick={() => {
                setHelp(false);
                setTourOpen(true);
              }}
            >
              Start guided tour <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
