import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import "./tour.css";
type Step = {
  page: number;
  target: string;
  title: string;
  body: string;
  click?: boolean;
};
const steps: Step[] = [
  {
    page: 7,
    target: '[data-tour="nav-7"]',
    title: "Start with Social SEO",
    body: "Click Social SEO in the sidebar. This is your workspace for measured social performance.",
    click: true,
  },
  {
    page: 7,
    target: '[data-tour="example-data"]',
    title: "Try the example workspace",
    body: "Click Explore example to explore fictional numbers. Your imported data stays separate. You can switch back to My data after the tour.",
    click: true,
  },
  {
    page: 7,
    target: '[data-tour="social-search"]',
    title: "Explore a keyword or topic",
    body: "Enter a topic and click Explore. This filters the supplied posts and queries; it does not invent search demand. Leave it empty to see everything.",
  },
  {
    page: 7,
    target: '[data-tour="tab-keyword-performance"]',
    title: "See keyword performance",
    body: "Click Keyword performance. Query rows show measured clicks, impressions and CTR. Topic rows show the performance of matching posts.",
    click: true,
  },
  {
    page: 7,
    target: '[data-tour="tab-similar-content"]',
    title: "Compare similar content",
    body: "Click Similar content, then choose a reference post from the dropdown. Comparisons use title/topic words and the observed dates; same-platform comparison is the default.",
    click: true,
  },
  {
    page: 7,
    target: '[data-tour="tab-competitors"]',
    title: "Compare accounts",
    body: "Click Competitors to benchmark the accounts included in your dataset. Add authorized competitor observations through imports to make this useful for your own research.",
    click: true,
  },
  {
    page: 7,
    target: '[data-tour="export-report"]',
    title: "Save a performance report",
    body: "Click Export to download the current daily performance report, including its source and coverage. You can also use Next to skip the download.",
  },
  {
    page: 7,
    target: '[data-tour="nav-8"]',
    title: "Connect your real accounts",
    body: "Click Integrations to set up official data pulls and the optional Claude tools.",
    click: true,
  },
  {
    page: 8,
    target: '[data-tour="connections"]',
    title: "Set up a provider and pull posts",
    body: "Open “Account access and environment setup” for your platform. Configure its approved token and account in .env, restart the server, then click Pull recent posts. This tour never runs a pull for you.",
  },
  {
    page: 8,
    target: '[data-tour="nav-7"]',
    title: "View your API results",
    body: "Click Social SEO to return to the performance workspace.",
    click: true,
  },
  {
    page: 7,
    target: '[data-tour="tab-api-snapshots"]',
    title: "Open API snapshots",
    body: "Click API snapshots for the latest lifetime counters from each pulled post. Filter by topic, click Find similar, or export. These counters are kept separate from daily imports.",
    click: true,
  },
  {
    page: 7,
    target: '[data-tour="import-data"]',
    title: "Bring daily metrics and search queries",
    body: "Import performance opens a CSV preview. Choose content or queries, paste or upload your export, confirm daily increments, validate, then import. API snapshots alone do not supply measured keyword demand.",
  },
  {
    page: 3,
    target: '[data-tour="nav-3"]',
    title: "Check a website’s HTML",
    body: "Click Site audit. Enter a domain and click Analyze website to check its public pages. You can also paste or upload page HTML and click Run HTML audit for static checks.",
    click: true,
  },
  {
    page: 6,
    target: '[data-tour="nav-6"]',
    title: "Find domain reports",
    body: "Click Reports to combine your public website scan, connected Google data, optional traffic estimates, imported queries, supplied links and observed ranks. Every source keeps its own coverage label.",
    click: true,
  },
  {
    page: 8,
    target: '[data-tour="claude-plugin"]',
    title: "Use the toolkit from Claude",
    body: "Open the plugin or direct MCP instructions here to connect Claude to the local toolkit. Use Start-Claude-SEO.cmd on the host computer for your Claude subscription. The in-app advisor is a separate opt-in API feature. You can replay this tour any time with Take a tour.",
  },
];
export default function GuidedTour({
  page,
  navigate,
  onClose,
}: {
  page: number;
  navigate: (page: number) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect>();
  const [located, setLocated] = useState(-1);
  const card = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  const step = steps[index];
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const original = previousFocus.current;
    return () => original?.focus();
  }, []);
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
    }
    addEventListener("keydown", escape);
    return () => removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    setRect(undefined);
    if (page !== step.page) navigateRef.current(step.page);
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let advanceTimer: ReturnType<typeof setTimeout>;
    let disposed = false;
    function update() {
      if (target) setRect(target.getBoundingClientRect());
    }
    function advance(event: MouseEvent) {
      if (
        !step.click ||
        !(event.target instanceof Element) ||
        !event.target.closest(step.target)
      )
        return;
      advanceTimer = setTimeout(
        () =>
          setIndex((i) =>
            i === index ? Math.min(steps.length - 1, i + 1) : i,
          ),
        0,
      );
    }
    function locate() {
      if (disposed) return;
      target = document.querySelector<HTMLElement>(step.target);
      if (!target) {
        timer = setTimeout(locate, 80);
        return;
      }
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "instant",
      });
      update();
      setLocated(index);
      card.current?.focus({ preventScroll: true });
    }
    timer = setTimeout(locate, 50);
    addEventListener("resize", update);
    addEventListener("scroll", update, true);
    document.addEventListener("click", advance, true);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(advanceTimer);
      document.removeEventListener("click", advance, true);
      removeEventListener("resize", update);
      removeEventListener("scroll", update, true);
    };
    // Navigate only when the tour step changes; ordinary target clicks must finish first.
  }, [index, step]);
  const width = Math.min(380, window.innerWidth - 24);
  const highlight = rect && {
    left: Math.max(4, rect.left - 5),
    top: Math.max(4, rect.top - 5),
    width: Math.min(rect.width + 10, window.innerWidth - 8),
    height: Math.min(rect.height + 10, window.innerHeight - 8),
  };
  const top = rect
    ? rect.bottom + 16 + 310 < window.innerHeight
      ? rect.bottom + 16
      : Math.max(12, rect.top - 310)
    : 90;
  return (
    <div className="guided-tour">
      <div className="tour-spotlight" style={highlight || { inset: 0 }} />
      <div
        className="tour-coach"
        data-tour-step={located === index && rect ? index + 1 : undefined}
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-description"
        style={{
          width,
          left:
            window.innerWidth < 640
              ? 12
              : Math.max(
                  12,
                  Math.min(rect?.left || 20, window.innerWidth - width - 12),
                ),
          top: window.innerWidth < 640 ? undefined : top,
        }}
      >
        <div className="tour-coach-top">
          <span>
            <Compass size={17} />
            WAYPOINT INTRODUCTION
          </span>
          <button
            className="icon-button"
            aria-label="Close tour"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <small>
          Step {index + 1} of {steps.length}
          {step.click ? " · click the highlighted button" : ""}
        </small>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-description">{step.body}</p>
        <div className="tour-progress" aria-hidden="true">
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="tour-actions">
          <button
            className="button secondary"
            disabled={!index}
            onClick={() => setIndex((i) => i - 1)}
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <button className="text-button" onClick={onClose}>
            Skip tour
          </button>
          <button
            className="button primary"
            onClick={() =>
              index === steps.length - 1 ? onClose() : setIndex((i) => i + 1)
            }
          >
            {index === steps.length - 1 ? "Finish" : "Next"}
            <ArrowRight size={14} />
          </button>
        </div>
        <span className="tour-keyboard">
          Escape closes · Back and Next are always available
        </span>
      </div>
    </div>
  );
}
