import 'leaflet/dist/leaflet.css';

import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  LoaderCircle,
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
import {MapContainer, Marker, Popup, Polyline, TileLayer, useMap} from 'react-leaflet';
import {divIcon, type LatLngExpression} from 'leaflet';

import {
  INFRA_KEYS,
  type CreateReportInput,
  type InfrastructureKey,
  type InfrastructureState,
  type LedgerReport,
  type LedgerSnapshot,
  type LedgerStation,
  type RouteConnection,
  type StationStatus,
} from '../shared/ledger';

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

const metricIcons = [Waves, TriangleAlert, Users];
const infraLabels = {
  lifts: Accessibility,
  escalators: Activity,
  ramps: TrendingUp,
} as const;

const infraStateLabels: Record<InfrastructureState, string> = {
  up: 'clear',
  degraded: 'degraded',
  down: 'offline',
};

const reportTypeOptions = [
  {value: 'alert', label: 'General alert'},
  {value: 'lift', label: 'Lift'},
  {value: 'escalator', label: 'Escalator'},
  {value: 'ramp', label: 'Ramp'},
  {value: 'crowd', label: 'Crowd'},
] as const;

type RoutePath = {
  stationIds: string[];
  score: number;
  totalMinutes: number;
};

type RouteResult = {
  fastest: RoutePath | null;
  stepFree: RoutePath | null;
};

type ReportFormState = {
  author: string;
  message: string;
  type: CreateReportInput['type'];
  severity: StationStatus;
  lifts: '' | InfrastructureState;
  escalators: '' | InfrastructureState;
  ramps: '' | InfrastructureState;
};

const initialReportForm: ReportFormState = {
  author: '',
  message: '',
  type: 'alert',
  severity: 'degraded',
  lifts: '',
  escalators: '',
  ramps: '',
};

function formatRelativeTime(timestamp: string) {
  const differenceMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.round(differenceMs / 60_000));
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function getStationById(stations: LedgerStation[], stationId: string) {
  return stations.find((station) => station.id === stationId) ?? null;
}

function buildAdjacency(connections: RouteConnection[]) {
  const adjacency = new Map<string, RouteConnection[]>();
  for (const connection of connections) {
    const forward = adjacency.get(connection.from) ?? [];
    forward.push(connection);
    adjacency.set(connection.from, forward);

    const reverse = adjacency.get(connection.to) ?? [];
    reverse.push({
      ...connection,
      from: connection.to,
      to: connection.from,
    });
    adjacency.set(connection.to, reverse);
  }
  return adjacency;
}

function findRoute(
  stations: LedgerStation[],
  connections: RouteConnection[],
  originId: string,
  destinationId: string,
  mode: 'fastest' | 'step-free',
) {
  if (originId === destinationId) {
    return {
      stationIds: [originId],
      totalMinutes: 0,
    };
  }

  const adjacency = buildAdjacency(connections);
  const queue = [{stationId: originId, score: 0, minutes: 0, path: [originId]}];
  const seen = new Map<string, number>([[originId, 0]]);

  while (queue.length > 0) {
    queue.sort((left, right) => left.score - right.score);
    const current = queue.shift()!;
    if (current.stationId === destinationId) {
      return {
        stationIds: current.path,
        score: current.score,
        totalMinutes: current.minutes,
      };
    }

    const nextConnections = adjacency.get(current.stationId) ?? [];
    for (const connection of nextConnections) {
      const station = getStationById(stations, connection.to);
      if (!station) {
        continue;
      }

      if (mode === 'step-free' && station.status === 'critical' && connection.to !== destinationId) {
        continue;
      }

      const penalty =
        mode === 'step-free'
          ? station.status === 'degraded'
            ? 6
            : 0
          : station.status === 'critical'
            ? 3
            : station.status === 'degraded'
            ? 1
            : 0;
      const nextScore = current.score + connection.minutes + penalty;
      const nextMinutes = current.minutes + connection.minutes;

      if (nextScore >= (seen.get(connection.to) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      seen.set(connection.to, nextScore);
      queue.push({
        stationId: connection.to,
        score: nextScore,
        minutes: nextMinutes,
        path: [...current.path, connection.to],
      });
    }
  }

  return null;
}

function describeRoute(path: RoutePath, stations: LedgerStation[]) {
  return path.stationIds
    .map((stationId) => getStationById(stations, stationId)?.name ?? stationId)
    .join(' -> ');
}

function pathHasRisk(path: RoutePath | null, stations: LedgerStation[]) {
  if (!path) {
    return false;
  }

  return path.stationIds.some((stationId) => {
    const station = getStationById(stations, stationId);
    return station?.status === 'critical';
  });
}

function buildMarkerIcon(status: StationStatus, selected: boolean) {
  return divIcon({
    className: 'station-marker-shell',
    html: `<span class="station-marker station-marker-${status}${selected ? ' is-selected' : ''}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function StatusSeal({status}: {status: StationStatus}) {
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
  type: InfrastructureKey;
  status: InfrastructureState;
}) {
  const Icon = infraLabels[type];
  return (
    <div className={`infra-mark infra-${status}`}>
      <Icon size={14} />
      <span>{type}</span>
      <strong>{infraStateLabels[status]}</strong>
    </div>
  );
}

function MapViewport({
  stations,
  selectedStationId,
}: {
  stations: LedgerStation[];
  selectedStationId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (stations.length === 0) {
      return;
    }

    const selectedStation = selectedStationId
      ? stations.find((station) => station.id === selectedStationId)
      : null;

    if (selectedStation) {
      map.flyTo([selectedStation.coordinates.lat, selectedStation.coordinates.lng], 13, {
        duration: 0.65,
      });
      return;
    }

    const bounds = stations.map(
      (station) => [station.coordinates.lat, station.coordinates.lng] as [number, number],
    );
    map.fitBounds(bounds, {padding: [24, 24]});
  }, [map, selectedStationId, stations]);

  return null;
}

function TransitMap({
  stations,
  connections,
  selectedStationId,
  onSelectStation,
}: {
  stations: LedgerStation[];
  connections: RouteConnection[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
}) {
  const defaultCenter: LatLngExpression = [3.146, 101.695];

  return (
    <div className="map-canvas">
      <MapContainer center={defaultCenter} zoom={12} scrollWheelZoom className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewport selectedStationId={selectedStationId} stations={stations} />

        {connections.map((connection) => {
          const from = getStationById(stations, connection.from);
          const to = getStationById(stations, connection.to);
          if (!from || !to) {
            return null;
          }

          return (
            <Polyline
              key={`${connection.from}-${connection.to}`}
              color={connection.color}
              opacity={0.85}
              positions={[
                [from.coordinates.lat, from.coordinates.lng],
                [to.coordinates.lat, to.coordinates.lng],
              ]}
              weight={5}
            />
          );
        })}

        {stations.map((station) => (
          <Marker
            key={station.id}
            eventHandlers={{
              click: () => onSelectStation(station.id),
            }}
            icon={buildMarkerIcon(station.status, station.id === selectedStationId)}
            position={[station.coordinates.lat, station.coordinates.lng]}
          >
            <Popup>
              <strong>{station.name}</strong>
              <br />
              {station.line}
              <br />
              {station.alert ?? station.note}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'feed' | 'planner'>('feed');
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportForm, setReportForm] = useState<ReportFormState>(initialReportForm);
  const [plannerOrigin, setPlannerOrigin] = useState('ttdi');
  const [plannerDestination, setPlannerDestination] = useState('klcc');
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const deferredSearch = useDeferredValue(search);
  const ledgerRef = useRef<HTMLElement | null>(null);
  const reportFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLedger() {
      try {
        setError(null);
        const response = await fetch('/api/ledger');
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load station ledger');
        }
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setSnapshot(payload);
          setSelectedStationId((current) => current ?? payload.stations[0]?.id ?? null);
          if (!payload.stations.some((station: LedgerStation) => station.id === plannerOrigin)) {
            setPlannerOrigin(payload.stations[0]?.id ?? '');
          }
          if (!payload.stations.some((station: LedgerStation) => station.id === plannerDestination)) {
            setPlannerDestination(payload.stations.at(1)?.id ?? payload.stations[0]?.id ?? '');
          }
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLedger();
    const timer = window.setInterval(loadLedger, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!snapshot || !plannerOrigin || !plannerDestination) {
      return;
    }

    setRouteResult({
      fastest: findRoute(snapshot.stations, snapshot.connections, plannerOrigin, plannerDestination, 'fastest'),
      stepFree: findRoute(
        snapshot.stations,
        snapshot.connections,
        plannerOrigin,
        plannerDestination,
        'step-free',
      ),
    });
  }, [plannerDestination, plannerOrigin, snapshot]);

  const filteredStations =
    snapshot?.stations.filter((station) => {
      const query = deferredSearch.trim().toLowerCase();
      if (!query) {
        return true;
      }
      return `${station.name} ${station.line} ${station.area}`.toLowerCase().includes(query);
    }) ?? [];

  const selectedStation =
    snapshot?.stations.find((station) => station.id === selectedStationId) ?? filteredStations[0] ?? null;
  const selectedStationReports =
    snapshot?.reports.filter((report) => report.stationId === selectedStation?.id).slice(0, 4) ?? [];

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStation) {
      return;
    }

    setSubmittingReport(true);
    setError(null);

    try {
      const payload: CreateReportInput = {
        stationId: selectedStation.id,
        author: reportForm.author,
        message: reportForm.message,
        type: reportForm.type,
        severity: reportForm.severity,
        infrastructure: {
          ...(reportForm.lifts ? {lifts: reportForm.lifts} : {}),
          ...(reportForm.escalators ? {escalators: reportForm.escalators} : {}),
          ...(reportForm.ramps ? {ramps: reportForm.ramps} : {}),
        },
      };

      const response = await fetch('/api/ledger/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const nextSnapshot = await response.json();
      if (!response.ok) {
        throw new Error(nextSnapshot.error ?? 'Unable to submit report');
      }

      startTransition(() => {
        setSnapshot(nextSnapshot);
        setSelectedStationId(selectedStation.id);
        setActiveTab('feed');
        setReportForm(initialReportForm);
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unknown error');
    } finally {
      setSubmittingReport(false);
    }
  }

  function focusLedger(stationId?: string) {
    if (stationId) {
      setSelectedStationId(stationId);
    }
    ledgerRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function focusReportsForm() {
    setActiveTab('feed');
    reportFormRef.current?.scrollIntoView({behavior: 'smooth', block: 'center'});
    reportFormRef.current?.querySelector('input')?.focus();
  }

  const dispatchStationId = snapshot?.dispatchNote.stationId ?? null;
  const dispatchStation = snapshot?.stations.find(
    (station) => station.id === dispatchStationId,
  );
  const recentReports = snapshot?.reports.slice(0, 4) ?? [];
  const fastestRisky = routeResult ? pathHasRisk(routeResult.fastest, snapshot?.stations ?? []) : false;

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
          <a href="#station-ledger">Inspector</a>
          <a href="#planner">Planner</a>
        </nav>
        <div className="live-chip">
          <span className="live-dot" />
          live field annotations
        </div>
      </header>

      <main className="page-grid">
        <section className="hero-panel" id="ledger">
          <motion.div
            animate={{opacity: 1, y: 0}}
            className="hero-copy"
            initial={{opacity: 0, y: 24}}
            transition={{duration: 0.5}}
          >
            <p className="eyebrow">Public transit accessibility watch</p>
            <h2>A working field ledger for lifts, ramps, and transfer friction in Kuala Lumpur.</h2>
            <p className="hero-text">
              Cards now inspect real station details, the ledger accepts persistent reports, and
              the map is a live spatial view instead of a painted placeholder.
            </p>
            <div className="hero-actions">
              <button
                className="ink-button ink-button-primary"
                onClick={() => focusLedger(snapshot?.stations.find((station) => station.status !== 'operational')?.id)}
                type="button"
              >
                Review active obstructions
              </button>
              <button className="ink-button" onClick={() => focusLedger(selectedStation?.id ?? undefined)} type="button">
                Open station ledger
              </button>
            </div>
            {error ? <p className="inline-error">{error}</p> : null}
          </motion.div>

          <motion.aside
            animate={{opacity: 1, rotate: -3, x: 0}}
            className="dispatch-note"
            initial={{opacity: 0, rotate: -2, x: 18}}
            transition={{delay: 0.15, duration: 0.6}}
          >
            <div className="dispatch-tape" />
            <p className="dispatch-label">Dispatch note</p>
            <h3>{snapshot?.dispatchNote.title ?? 'Loading current hinge station...'}</h3>
            <p>{snapshot?.dispatchNote.message ?? 'Pulling the latest station annotations.'}</p>
            <div className="dispatch-meta">
              <span>
                Last sync{' '}
                {snapshot?.dispatchNote.syncedAt ? formatRelativeTime(snapshot.dispatchNote.syncedAt) : '...'}
              </span>
              <span>
                confidence {snapshot ? snapshot.dispatchNote.confidence.toFixed(2) : '0.00'}
              </span>
            </div>
            {dispatchStation ? <StatusSeal status={dispatchStation.status} /> : null}
          </motion.aside>
        </section>

        <section aria-label="Key metrics" className="metrics-row">
          {(snapshot?.metrics ?? []).map((metric, index) => {
            const Icon = metricIcons[index] ?? Waves;
            return (
              <motion.article
                animate={{opacity: 1, y: 0}}
                className="metric-card"
                initial={{opacity: 0, y: 18}}
                key={metric.label}
                transition={{delay: 0.1 + index * 0.08}}
              >
                <div className={`metric-icon metric-${metric.tone}`}>
                  <Icon size={20} />
                </div>
                <p className="metric-label">{metric.label}</p>
                <div className="metric-value-row">
                  <h3>{metric.value}</h3>
                  <span>{metric.sub}</span>
                </div>
                <p className="metric-detail">{metric.detail}</p>
              </motion.article>
            );
          })}
          {loading && !snapshot ? (
            <article className="metric-card loading-card">
              <LoaderCircle className="spin" size={20} />
              <p className="metric-detail">Loading ledger snapshot...</p>
            </article>
          ) : null}
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
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter station cards"
                  type="text"
                  value={search}
                />
              </label>
            </div>

            <div className="station-grid">
              {filteredStations.map((station, index) => (
                <motion.article
                  animate={{opacity: 1, y: 0}}
                  className={`station-card station-${station.status}${selectedStation?.id === station.id ? ' station-selected' : ''}`}
                  initial={{opacity: 0, y: 18}}
                  key={station.id}
                  transition={{delay: 0.2 + index * 0.05}}
                >
                  <div className="station-card-top">
                    <div>
                      <p className="station-line">{station.line}</p>
                      <h4>{station.name}</h4>
                      <p className="station-area">{station.area}</p>
                    </div>
                    <StatusSeal status={station.status} />
                  </div>

                  {station.alert ? (
                    <div className="alert-strip">
                      <AlertTriangle size={16} />
                      <p>{station.alert}</p>
                    </div>
                  ) : null}

                  <p className="station-note">{station.note}</p>

                  <div className="infra-row">
                    {INFRA_KEYS.map((type) => (
                      <React.Fragment key={type}>
                        <InfraMark status={station.infrastructure[type]} type={type} />
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="station-foot">
                    <span>
                      verified {formatRelativeTime(station.verifiedAt)} • {station.reportCount} notes
                    </span>
                    <button onClick={() => focusLedger(station.id)} type="button">
                      inspect card
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </motion.article>
              ))}
            </div>

            <section className="station-ledger-panel" id="station-ledger" ref={ledgerRef}>
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Inspection ledger</p>
                  <h3>{selectedStation ? selectedStation.name : 'Select a station'}</h3>
                </div>
                {selectedStation ? <StatusSeal status={selectedStation.status} /> : null}
              </div>

              {selectedStation ? (
                <>
                  <div className="station-ledger-topline">
                    <span>{selectedStation.line}</span>
                    <span>{selectedStation.area}</span>
                    <span>{formatRelativeTime(selectedStation.verifiedAt)}</span>
                  </div>
                  <p className="station-ledger-copy">{selectedStation.alert ?? selectedStation.note}</p>

                  <div className="ledger-columns">
                    <div className="ledger-subpanel">
                      <p className="eyebrow">Current infrastructure</p>
                      <div className="infra-row">
                        {INFRA_KEYS.map((type) => (
                          <React.Fragment key={type}>
                            <InfraMark status={selectedStation.infrastructure[type]} type={type} />
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    <div className="ledger-subpanel">
                      <div className="section-heading compact mini-heading">
                        <div>
                          <p className="eyebrow">Recent notes</p>
                        </div>
                      </div>
                      <div className="ledger-report-stack">
                        {selectedStationReports.map((report) => (
                          <article className="ledger-report-card" key={report.id}>
                            <div className="incident-top">
                              <div>
                                <p className="incident-user">{report.author}</p>
                                <h4>{selectedStation.name}</h4>
                              </div>
                              <span>
                                <Clock3 size={12} />
                                {formatRelativeTime(report.createdAt)}
                              </span>
                            </div>
                            <p className="incident-message">{report.message}</p>
                          </article>
                        ))}
                        {selectedStationReports.length === 0 ? (
                          <p className="station-note">No reports yet for this station.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <form className="report-form" onSubmit={submitReport} ref={reportFormRef}>
                    <div className="section-heading compact mini-heading">
                      <div>
                        <p className="eyebrow">Add handwritten report</p>
                        <h3>Persist a new station note</h3>
                      </div>
                      <div className="live-mini">
                        <span className="live-dot" />
                        {submittingReport ? 'saving' : 'stored'}
                      </div>
                    </div>

                    <div className="report-form-grid">
                      <label className="form-field">
                        <span>Author</span>
                        <div className="field-shell">
                          <input
                            onChange={(event) =>
                              setReportForm((current) => ({...current, author: event.target.value}))
                            }
                            placeholder="Field note 21"
                            value={reportForm.author}
                          />
                        </div>
                      </label>

                      <label className="form-field">
                        <span>Type</span>
                        <div className="field-shell">
                          <select
                            onChange={(event) =>
                              setReportForm((current) => ({
                                ...current,
                                type: event.target.value as CreateReportInput['type'],
                              }))
                            }
                            value={reportForm.type}
                          >
                            {reportTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </label>

                      <label className="form-field">
                        <span>Severity</span>
                        <div className="field-shell">
                          <select
                            onChange={(event) =>
                              setReportForm((current) => ({
                                ...current,
                                severity: event.target.value as StationStatus,
                              }))
                            }
                            value={reportForm.severity}
                          >
                            <option value="operational">Operational</option>
                            <option value="degraded">Degraded</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                      </label>

                      {INFRA_KEYS.map((key) => (
                        <label className="form-field" key={key}>
                          <span>{key}</span>
                          <div className="field-shell">
                            <select
                              onChange={(event) =>
                                setReportForm((current) => ({
                                  ...current,
                                  [key]: event.target.value as '' | InfrastructureState,
                                }))
                              }
                              value={reportForm[key]}
                            >
                              <option value="">No change</option>
                              <option value="up">Clear</option>
                              <option value="degraded">Degraded</option>
                              <option value="down">Offline</option>
                            </select>
                          </div>
                        </label>
                      ))}
                    </div>

                    <label className="form-field">
                      <span>Annotation</span>
                      <div className="field-shell field-shell-textarea">
                        <textarea
                          onChange={(event) =>
                            setReportForm((current) => ({...current, message: event.target.value}))
                          }
                          placeholder="Describe what changed on the ground."
                          rows={4}
                          value={reportForm.message}
                        />
                      </div>
                    </label>

                    <div className="hero-actions">
                      <button className="ink-button ink-button-primary" disabled={submittingReport} type="submit">
                        {submittingReport ? 'Saving report...' : 'Save report'}
                      </button>
                      <button
                        className="ink-button"
                        onClick={() => setReportForm(initialReportForm)}
                        type="button"
                      >
                        Reset
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <p className="station-note">Pick a station card to inspect its ledger and add a report.</p>
              )}
            </section>

            <article className="map-ledger">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Spatial index</p>
                  <h3>Live station map</h3>
                </div>
                <div className="stamp-chip">
                  <Stamp size={14} />
                  leaflet + OSM
                </div>
              </div>
              {snapshot ? (
                <>
                  <TransitMap
                    connections={snapshot.connections}
                    onSelectStation={(stationId) => focusLedger(stationId)}
                    selectedStationId={selectedStation?.id ?? null}
                    stations={snapshot.stations}
                  />
                  <div className="map-caption">
                    Click a marker to inspect that station. Rust nodes mark critical access risk,
                    amber means degraded circulation, teal remains clear.
                  </div>
                </>
              ) : (
                <div className="map-placeholder">
                  <LoaderCircle className="spin" size={18} />
                  Loading live map...
                </div>
              )}
            </article>
          </div>

          <aside className="side-column">
            <section className="tab-panel" id="planner">
              <div className="tab-switch">
                <button
                  data-active={activeTab === 'feed'}
                  onClick={() => setActiveTab('feed')}
                  type="button"
                >
                  Incident desk
                </button>
                <button
                  data-active={activeTab === 'planner'}
                  onClick={() => setActiveTab('planner')}
                  type="button"
                >
                  Route desk
                </button>
              </div>

              <AnimatePresence mode="wait">
                {activeTab === 'feed' ? (
                  <motion.div
                    animate={{opacity: 1, y: 0}}
                    className="feed-stack"
                    exit={{opacity: 0, y: -10}}
                    initial={{opacity: 0, y: 12}}
                    key="feed"
                  >
                    <div className="section-heading compact">
                      <div>
                        <p className="eyebrow">Live notes</p>
                        <h3>Recent community reports</h3>
                      </div>
                      <div className="live-mini">
                        <span className="live-dot" />
                        {snapshot ? formatRelativeTime(snapshot.fetchedAt) : 'updating'}
                      </div>
                    </div>

                    {recentReports.map((report) => {
                      const station = snapshot?.stations.find((entry) => entry.id === report.stationId);
                      return (
                        <article className="incident-card" key={report.id}>
                          <div className="incident-top">
                            <div>
                              <p className="incident-user">{report.author}</p>
                              <h4>{station?.name ?? report.stationId}</h4>
                            </div>
                            <span>
                              <Clock3 size={12} />
                              {formatRelativeTime(report.createdAt)}
                            </span>
                          </div>
                          <p className="incident-message">{report.message}</p>
                          <div className="incident-actions">
                            <button onClick={() => focusLedger(report.stationId)} type="button">
                              inspect
                            </button>
                            <button onClick={focusReportsForm} type="button">
                              annotate
                            </button>
                          </div>
                        </article>
                      );
                    })}

                    <button className="report-button" onClick={focusReportsForm} type="button">
                      <Sparkles size={16} />
                      Add handwritten report
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    animate={{opacity: 1, y: 0}}
                    className="planner-stack"
                    exit={{opacity: 0, y: -10}}
                    initial={{opacity: 0, y: 12}}
                    key="planner"
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
                        <select
                          onChange={(event) => setPlannerOrigin(event.target.value)}
                          value={plannerOrigin}
                        >
                          {snapshot?.stations.map((station) => (
                            <option key={station.id} value={station.id}>
                              {station.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>

                    <div className="route-arrow">
                      <ArrowRight size={15} />
                    </div>

                    <label className="form-field">
                      <span>Destination</span>
                      <div className="field-shell">
                        <Compass size={15} />
                        <select
                          onChange={(event) => setPlannerDestination(event.target.value)}
                          value={plannerDestination}
                        >
                          {snapshot?.stations.map((station) => (
                            <option key={station.id} value={station.id}>
                              {station.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>

                    <button
                      className="ink-button ink-button-primary full-width"
                      onClick={() => {
                        const route = routeResult?.stepFree ?? routeResult?.fastest;
                        if (route) {
                          focusLedger(route.stationIds[0]);
                        }
                      }}
                      type="button"
                    >
                      Find step-free path
                    </button>

                    <article className={`route-card ${fastestRisky ? 'route-rejected' : 'route-ok'}`}>
                      <p className="route-chip">fastest route</p>
                      <div className="route-top">
                        <h4>{routeResult?.fastest ? `${routeResult.fastest.totalMinutes} min` : 'N/A'}</h4>
                        <span>{fastestRisky ? 'risk flagged' : 'clear'}</span>
                      </div>
                      <p>
                        {routeResult?.fastest
                          ? `${describeRoute(routeResult.fastest, snapshot?.stations ?? [])}. ${
                              fastestRisky
                                ? 'This route still crosses a critical station in the current ledger.'
                                : 'No critical stations on the fastest monitored path.'
                            }`
                          : 'No monitored path available for this station pair.'}
                      </p>
                    </article>

                    <article className="route-card route-recommended">
                      <p className="route-chip">recommended</p>
                      <div className="route-top">
                        <h4>{routeResult?.stepFree ? `${routeResult.stepFree.totalMinutes} min` : 'N/A'}</h4>
                        <span>
                          <CheckCircle2 size={14} />
                          step-free bias
                        </span>
                      </div>
                      <p>
                        {routeResult?.stepFree
                          ? `${describeRoute(routeResult.stepFree, snapshot?.stations ?? [])}. Built to avoid critical stations and penalize degraded interchanges.`
                          : 'No safer monitored path is available without crossing a critical station.'}
                      </p>
                    </article>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <section className="method-card">
              <p className="eyebrow">Method note</p>
              <h3>Persistent annotations with optional cloud storage</h3>
              <p>
                Reports are written through the backend ledger API. If `PTDOG_GCS_BUCKET` is set,
                the server writes to Google Cloud Storage and mirrors a local fallback file.
              </p>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
