import React, {useState} from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  MapPin,
  Search,
  ShieldAlert,
  Sparkles,
  Stamp,
  TrendingUp,
  TriangleAlert,
  Users,
  Waves,
  Accessibility,
} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';

const STATIONS = [
  {
    id: 'pasar-seni',
    name: 'Pasar Seni',
    line: 'LRT Kelana Jaya / MRT Kajang',
    status: 'critical',
    alert: 'Transfer lift offline between concourse and MRT interchange.',
    verified: 'verified 2 min ago',
    note: 'Street-level reroute available but adds 11 minutes.',
    infrastructure: {
      lifts: 'down',
      escalators: 'up',
      ramps: 'up',
    },
  },
  {
    id: 'kl-sentral',
    name: 'KL Sentral',
    line: 'Interchange Hub',
    status: 'operational',
    verified: 'verified 4 min ago',
    note: 'Platform access clear across all primary links.',
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up',
    },
  },
  {
    id: 'masjid-jamek',
    name: 'Masjid Jamek',
    line: 'LRT Kelana Jaya / Ampang',
    status: 'degraded',
    alert: 'Escalator maintenance near Gate C slows transfers.',
    verified: 'verified 8 min ago',
    note: 'Step-free route remains open through the north corridor.',
    infrastructure: {
      lifts: 'up',
      escalators: 'degraded',
      ramps: 'up',
    },
  },
  {
    id: 'ttdi',
    name: 'TTDI',
    line: 'MRT Kajang',
    status: 'operational',
    verified: 'verified 12 min ago',
    note: 'Lower concourse flow is light this hour.',
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up',
    },
  },
  {
    id: 'bukit-bintang',
    name: 'Bukit Bintang',
    line: 'MRT Kajang / Monorail',
    status: 'operational',
    verified: 'verified 6 min ago',
    note: 'Monorail bridge access stable after morning checks.',
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up',
    },
  },
  {
    id: 'klcc',
    name: 'KLCC',
    line: 'LRT Kelana Jaya',
    status: 'operational',
    verified: 'verified 5 min ago',
    note: 'Entrance A and park-side lifts both responsive.',
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up',
    },
  },
];

const INCIDENTS = [
  {
    id: 1,
    time: '2 min ago',
    user: 'Field note 18',
    location: 'TTDI Gate B',
    message: 'Platform lift is stalled at upper landing. Staff already notified.',
    type: 'lift',
  },
  {
    id: 2,
    time: '15 min ago',
    user: 'Community desk',
    location: 'Pasar Seni',
    message: 'Transfer lift still unavailable. Street crossing remains the safest detour.',
    type: 'alert',
  },
  {
    id: 3,
    time: '45 min ago',
    user: 'Volunteer watch',
    location: 'KL Sentral',
    message: 'Escalator near ERL entrance is loud, but step-free access is unaffected.',
    type: 'escalator',
  },
];

const METRICS = [
  {
    label: 'Network legibility',
    value: '84%',
    sub: 'steady but fragile',
    detail: '3 unresolved access obstructions remain in the core ring.',
    icon: Waves,
  },
  {
    label: 'Lift outages',
    value: '03',
    sub: 'priority watch',
    detail: 'Pasar Seni remains the most disruptive interchange failure.',
    icon: TriangleAlert,
  },
  {
    label: 'Crowd pressure',
    value: 'Moderate',
    sub: 'pre-peak build',
    detail: 'Crowding is rising toward KLCC and Bukit Bintang corridors.',
    icon: Users,
  },
];

const statusTone = {
  operational: {
    chip: 'operational',
    accent: 'var(--ink-teal)',
    fill: 'var(--wash-sage)',
  },
  degraded: {
    chip: 'degraded',
    accent: 'var(--ink-gold)',
    fill: 'var(--wash-amber)',
  },
  critical: {
    chip: 'critical',
    accent: 'var(--ink-rust)',
    fill: 'var(--wash-rust)',
  },
} as const;

function StatusSeal({status}: {status: keyof typeof statusTone}) {
  const tone = statusTone[status];
  return (
    <span
      className="status-seal"
      style={
        {
          '--seal-accent': tone.accent,
          '--seal-fill': tone.fill,
        } as React.CSSProperties
      }
    >
      {tone.chip}
    </span>
  );
}

function InfraMark({
  type,
  status,
}: {
  type: 'lifts' | 'escalators' | 'ramps';
  status: string;
}) {
  const Icon = type === 'lifts' ? Accessibility : type === 'escalators' ? Activity : TrendingUp;
  const label = status === 'up' ? 'clear' : status;
  return (
    <div className={`infra-mark infra-${status}`}>
      <Icon size={14} />
      <span>{type}</span>
      <strong>{label}</strong>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'feed' | 'planner'>('feed');

  return (
    <div className="app-shell">
      <div className="paper-noise" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <ShieldAlert size={18} />
          </div>
          <div>
            <p className="eyebrow">Klang Valley mobility ledger</p>
            <h1>PTdog</h1>
          </div>
        </div>
        <nav className="topnav" aria-label="Primary">
          <a href="#ledger">Ledger</a>
          <a href="#stations">Stations</a>
          <a href="#planner">Planner</a>
          <a href="#method">Method</a>
        </nav>
        <div className="live-chip">
          <span className="live-dot" />
          live field annotations
        </div>
      </header>

      <main className="page-grid">
        <section className="hero-panel" id="ledger">
          <motion.div
            initial={{opacity: 0, y: 24}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.5}}
            className="hero-copy"
          >
            <p className="eyebrow">Public transit accessibility watch</p>
            <h2>
              A paper trail for lifts, ramps, and transfer friction across Kuala Lumpur.
            </h2>
            <p className="hero-text">
              The interface now behaves like a field notebook: soft paper stock, hard ink
              hierarchy, stamped alerts, and quick route judgment without the usual dashboard
              chrome.
            </p>
            <div className="hero-actions">
              <button className="ink-button ink-button-primary">
                Review active obstructions
              </button>
              <button className="ink-button">Open station ledger</button>
            </div>
          </motion.div>

          <motion.aside
            initial={{opacity: 0, rotate: -2, x: 18}}
            animate={{opacity: 1, rotate: -3, x: 0}}
            transition={{delay: 0.15, duration: 0.6}}
            className="dispatch-note"
          >
            <div className="dispatch-tape" />
            <p className="dispatch-label">Dispatch note</p>
            <h3>Pasar Seni remains the system hinge.</h3>
            <p>
              One failed transfer lift is causing the largest detour burden this afternoon.
              Crowd reports and official telemetry agree.
            </p>
            <div className="dispatch-meta">
              <span>Last sync 14:22 MYT</span>
              <span>confidence 0.98</span>
            </div>
          </motion.aside>
        </section>

        <section className="metrics-row" aria-label="Key metrics">
          {METRICS.map((metric, index) => (
            <motion.article
              key={metric.label}
              initial={{opacity: 0, y: 18}}
              animate={{opacity: 1, y: 0}}
              transition={{delay: 0.1 + index * 0.08}}
              className="metric-card"
            >
              <div className="metric-icon">
                <metric.icon size={20} />
              </div>
              <p className="metric-label">{metric.label}</p>
              <div className="metric-value-row">
                <h3>{metric.value}</h3>
                <span>{metric.sub}</span>
              </div>
              <p className="metric-detail">{metric.detail}</p>
            </motion.article>
          ))}
        </section>

        <section className="board-layout">
          <div className="station-column" id="stations">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Annotated station ledger</p>
                <h3>Field-checked access conditions</h3>
              </div>
              <label className="search-frame">
                <Search size={15} />
                <input type="text" placeholder="Filter station cards" />
              </label>
            </div>

            <div className="station-grid">
              {STATIONS.map((station, index) => (
                <motion.article
                  key={station.id}
                  initial={{opacity: 0, y: 18}}
                  animate={{opacity: 1, y: 0}}
                  transition={{delay: 0.2 + index * 0.05}}
                  className={`station-card station-${station.status}`}
                >
                  <div className="station-card-top">
                    <div>
                      <p className="station-line">{station.line}</p>
                      <h4>{station.name}</h4>
                    </div>
                    <StatusSeal status={station.status as keyof typeof statusTone} />
                  </div>

                  {station.alert ? (
                    <div className="alert-strip">
                      <AlertTriangle size={16} />
                      <p>{station.alert}</p>
                    </div>
                  ) : null}

                  <p className="station-note">{station.note}</p>

                  <div className="infra-row">
                    <InfraMark type="lifts" status={station.infrastructure.lifts} />
                    <InfraMark type="escalators" status={station.infrastructure.escalators} />
                    <InfraMark type="ramps" status={station.infrastructure.ramps} />
                  </div>

                  <div className="station-foot">
                    <span>{station.verified}</span>
                    <button>
                      inspect card
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </motion.article>
              ))}
            </div>

            <article className="map-ledger">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Spatial index</p>
                  <h3>Manual map board</h3>
                </div>
                <div className="stamp-chip">
                  <Stamp size={14} />
                  pinboard view
                </div>
              </div>
              <div className="map-paper">
                <div className="map-grid-lines" />
                <div className="map-route route-a" />
                <div className="map-route route-b" />
                <div className="map-node node-critical">
                  <span>Pasar Seni</span>
                </div>
                <div className="map-node node-stable">
                  <span>KL Sentral</span>
                </div>
                <div className="map-node node-stable alt">
                  <span>KLCC</span>
                </div>
                <div className="map-caption">
                  Interchange pressure concentrates around central transfer points. Critical nodes
                  are marked in rust ink; stable nodes stay in faded teal.
                </div>
              </div>
            </article>
          </div>

          <aside className="side-column">
            <section className="tab-panel" id="planner">
              <div className="tab-switch">
                <button
                  type="button"
                  data-active={activeTab === 'feed'}
                  onClick={() => setActiveTab('feed')}
                >
                  Incident desk
                </button>
                <button
                  type="button"
                  data-active={activeTab === 'planner'}
                  onClick={() => setActiveTab('planner')}
                >
                  Route desk
                </button>
              </div>

              <AnimatePresence mode="wait">
                {activeTab === 'feed' ? (
                  <motion.div
                    key="feed"
                    initial={{opacity: 0, y: 12}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -10}}
                    className="feed-stack"
                  >
                    <div className="section-heading compact">
                      <div>
                        <p className="eyebrow">Live notes</p>
                        <h3>Recent community reports</h3>
                      </div>
                      <div className="live-mini">
                        <span className="live-dot" />
                        updating
                      </div>
                    </div>

                    {INCIDENTS.map((incident) => (
                      <article key={incident.id} className="incident-card">
                        <div className="incident-top">
                          <div>
                            <p className="incident-user">{incident.user}</p>
                            <h4>{incident.location}</h4>
                          </div>
                          <span>
                            <Clock3 size={12} />
                            {incident.time}
                          </span>
                        </div>
                        <p className="incident-message">{incident.message}</p>
                        <div className="incident-actions">
                          <button>verify</button>
                          <button>annotate</button>
                        </div>
                      </article>
                    ))}

                    <button className="report-button">
                      <Sparkles size={16} />
                      Add handwritten report
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="planner"
                    initial={{opacity: 0, y: 12}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0, y: -10}}
                    className="planner-stack"
                  >
                    <div className="section-heading compact">
                      <div>
                        <p className="eyebrow">Accessible planner</p>
                        <h3>Route with obstruction awareness</h3>
                      </div>
                    </div>

                    <label className="form-field">
                      <span>Origin</span>
                      <div className="field-shell">
                        <MapPin size={15} />
                        <input defaultValue="Sunway" />
                      </div>
                    </label>

                    <div className="route-arrow">
                      <ArrowRight size={15} />
                    </div>

                    <label className="form-field">
                      <span>Destination</span>
                      <div className="field-shell">
                        <Compass size={15} />
                        <input defaultValue="KLCC" />
                      </div>
                    </label>

                    <button className="ink-button ink-button-primary full-width">
                      Find step-free path
                    </button>

                    <article className="route-card route-rejected">
                      <p className="route-chip">fastest route</p>
                      <div className="route-top">
                        <h4>45 min</h4>
                        <span>rejected</span>
                      </div>
                      <p>Masjid Jamek interchange introduces stairs during current disruption.</p>
                    </article>

                    <article className="route-card route-recommended">
                      <p className="route-chip">recommended</p>
                      <div className="route-top">
                        <h4>55 min</h4>
                        <span>
                          <CheckCircle2 size={14} />
                          step-free
                        </span>
                      </div>
                      <p>
                        MRT Kajang to Bukit Bintang, then Monorail. All required lifts verified in
                        the last 6 minutes.
                      </p>
                    </article>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <section className="method-card" id="method">
              <p className="eyebrow">Method note</p>
              <h3>Telemetry plus witness accounts</h3>
              <p>
                PTdog combines GTFS movement data, station fault notices, and human reports into a
                single readable record. The interface favors legibility over glossy control panels.
              </p>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
