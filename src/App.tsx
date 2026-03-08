import 'leaflet/dist/leaflet.css';

import React, {startTransition, useDeferredValue, useEffect, useRef, useState} from 'react';
import {
  Accessibility,
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
  TrendingUp,
} from 'lucide-react';
import {motion} from 'motion/react';
import {divIcon, type LatLngExpression} from 'leaflet';
import {MapContainer, Marker, Popup, Polyline, TileLayer, useMap} from 'react-leaflet';

import type {AssistantRouteContext} from '../shared/assistant';
import {
  INFRA_KEYS,
  type InfrastructureKey,
  type InfrastructureState,
  type LedgerSnapshot,
  type LedgerStation,
  type RouteConnection,
  type StationStatus,
} from '../shared/ledger';
import AssistantDock from './AssistantDock';

const statusTone = {
  operational: {
    chip: 'clear',
    accent: 'var(--ink-teal)',
    fill: 'var(--wash-sage)',
  },
  degraded: {
    chip: 'limited',
    accent: 'var(--ink-gold)',
    fill: 'var(--wash-amber)',
  },
  critical: {
    chip: 'avoid',
    accent: 'var(--ink-rust)',
    fill: 'var(--wash-rust)',
  },
} as const;

const infraLabels = {
  lifts: Accessibility,
  escalators: Activity,
  ramps: TrendingUp,
} as const;

const infraStateLabels: Record<InfrastructureState, string> = {
  up: 'clear',
  degraded: 'limited',
  down: 'offline',
};

type RoutePath = {
  stationIds: string[];
  score: number;
  totalMinutes: number;
};

type RouteResult = {
  fastest: RoutePath | null;
  stepFree: RoutePath | null;
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
      score: 0,
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

    for (const connection of adjacency.get(current.stationId) ?? []) {
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
        duration: 0.6,
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
      <MapContainer center={defaultCenter} zoom={12} className="leaflet-map" scrollWheelZoom>
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
              opacity={0.75}
              positions={[
                [from.coordinates.lat, from.coordinates.lng],
                [to.coordinates.lat, to.coordinates.lng],
              ]}
              weight={4}
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
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plannerOrigin, setPlannerOrigin] = useState('ttdi');
  const [plannerDestination, setPlannerDestination] = useState('klcc');
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const deferredSearch = useDeferredValue(search);
  const detailsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        setError(null);
        const response = await fetch('/api/ledger');
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load station status');
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

    loadSnapshot();
    const timer = window.setInterval(loadSnapshot, 60_000);

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

  function focusDetails(stationId?: string) {
    if (stationId) {
      setSelectedStationId(stationId);
    }
    detailsRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

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
    snapshot?.reports.filter((report) => report.stationId === selectedStation?.id).slice(0, 3) ?? [];
  const disruptedCount =
    snapshot?.stations.filter((station) => station.status !== 'operational').length ?? 0;
  const recommendedRoute = routeResult?.stepFree ?? routeResult?.fastest ?? null;
  const fastestRisky = routeResult ? pathHasRisk(routeResult.fastest, snapshot?.stations ?? []) : false;
  const assistantRoute: AssistantRouteContext | null =
    recommendedRoute && snapshot
      ? {
          stationIds: recommendedRoute.stationIds,
          totalMinutes: recommendedRoute.totalMinutes,
          summary: describeRoute(recommendedRoute, snapshot.stations),
        }
      : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <ShieldAlert size={18} />
          </div>
          <div>
            <p className="eyebrow">Accessible transit</p>
            <h1>PTdog</h1>
          </div>
        </div>
        <div className="live-chip">
          <span className="live-dot" />
          updates every minute
        </div>
      </header>

      <main className="page-shell">
        <section className="hero">
          <motion.div
            animate={{opacity: 1, y: 0}}
            className="hero-copy"
            initial={{opacity: 0, y: 18}}
            transition={{duration: 0.45}}
          >
            <p className="eyebrow">Before you travel</p>
            <h2>Check which stations are usable right now.</h2>
            <p className="hero-text">
              PTdog helps riders see lift, escalator, and ramp conditions across key Klang Valley
              stations without making them read operator-style dashboards.
            </p>

            <div className="hero-summary">
              <div className="summary-pill">
                <strong>{snapshot?.stations.length ?? 0}</strong>
                <span>stations tracked</span>
              </div>
              <div className="summary-pill">
                <strong>{disruptedCount}</strong>
                <span>need extra care</span>
              </div>
            </div>

            {error ? <p className="inline-error">{error}</p> : null}
          </motion.div>

          <motion.section
            animate={{opacity: 1, y: 0}}
            className="planner-card"
            id="planner"
            initial={{opacity: 0, y: 18}}
            transition={{delay: 0.08, duration: 0.45}}
          >
            <p className="eyebrow">Trip planner</p>
            <h3>Choose the lower-friction route</h3>

            <div className="planner-fields">
              <label className="field-shell">
                <MapPin size={15} />
                <select onChange={(event) => setPlannerOrigin(event.target.value)} value={plannerOrigin}>
                  {snapshot?.stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="route-arrow">
                <ArrowRight size={15} />
              </div>

              <label className="field-shell">
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
              </label>
            </div>

            <div className="route-panel">
              <p className="route-label">Recommended</p>
              <div className="route-topline">
                <h4>{recommendedRoute ? `${recommendedRoute.totalMinutes} min` : 'No route'}</h4>
                {recommendedRoute ? (
                  <span className="route-safe">
                    <CheckCircle2 size={14} />
                    fewer barriers
                  </span>
                ) : null}
              </div>
              <p className="route-copy">
                {recommendedRoute
                  ? describeRoute(recommendedRoute, snapshot?.stations ?? [])
                  : 'No monitored path is available for this station pair.'}
              </p>
              {routeResult?.fastest && fastestRisky ? (
                <p className="route-note">
                  The fastest option is shorter, but it crosses a currently disrupted station.
                </p>
              ) : null}
            </div>
          </motion.section>
        </section>

        <section className="content-grid">
          <motion.section
            animate={{opacity: 1, y: 0}}
            className="panel map-panel"
            initial={{opacity: 0, y: 18}}
            transition={{delay: 0.12, duration: 0.45}}
          >
            <div className="panel-head">
              <div>
                <p className="eyebrow">Map</p>
                <h3>{selectedStation ? selectedStation.name : 'Monitored stations'}</h3>
              </div>
              {selectedStation ? <StatusSeal status={selectedStation.status} /> : null}
            </div>

            {snapshot ? (
              <>
                <TransitMap
                  connections={snapshot.connections}
                  onSelectStation={focusDetails}
                  selectedStationId={selectedStation?.id ?? null}
                  stations={snapshot.stations}
                />
                <p className="panel-note">
                  Tap a station on the map or list to see whether it is clear, limited, or best
                  avoided.
                </p>
              </>
            ) : (
              <div className="loading-state">
                <LoaderCircle className="spin" size={18} />
                Loading map...
              </div>
            )}
          </motion.section>

          <div className="sidebar">
            <motion.section
              animate={{opacity: 1, y: 0}}
              className="panel"
              id="stations"
              initial={{opacity: 0, y: 18}}
              transition={{delay: 0.16, duration: 0.45}}
            >
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Stations</p>
                  <h3>Current access</h3>
                </div>
                <label className="search-frame">
                  <Search size={15} />
                  <input
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search stations"
                    type="text"
                    value={search}
                  />
                </label>
              </div>

              <div className="station-list">
                {filteredStations.map((station) => (
                  <article
                    className={`station-card${selectedStation?.id === station.id ? ' station-selected' : ''}`}
                    key={station.id}
                  >
                    <div className="station-card-top">
                      <div>
                        <p className="station-line">{station.line}</p>
                        <h4>{station.name}</h4>
                      </div>
                      <StatusSeal status={station.status} />
                    </div>

                    <p className="station-note">{station.alert ?? station.note}</p>

                    <div className="station-foot">
                      <span>{formatRelativeTime(station.verifiedAt)}</span>
                      <button onClick={() => focusDetails(station.id)} type="button">
                        details
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </motion.section>

            <motion.section
              animate={{opacity: 1, y: 0}}
              className="panel details-panel"
              id="details"
              initial={{opacity: 0, y: 18}}
              ref={detailsRef}
              transition={{delay: 0.2, duration: 0.45}}
            >
              {selectedStation ? (
                <>
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">Station details</p>
                      <h3>{selectedStation.name}</h3>
                    </div>
                    <StatusSeal status={selectedStation.status} />
                  </div>

                  <div className="details-meta">
                    <span>{selectedStation.line}</span>
                    <span>{selectedStation.area}</span>
                    <span>checked {formatRelativeTime(selectedStation.verifiedAt)}</span>
                  </div>

                  <p className="details-copy">{selectedStation.alert ?? selectedStation.note}</p>

                  <div className="infra-row">
                    {INFRA_KEYS.map((type) => (
                      <React.Fragment key={type}>
                        <InfraMark status={selectedStation.infrastructure[type]} type={type} />
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="updates-block">
                    <p className="eyebrow">Latest updates</p>
                    <div className="update-list">
                      {selectedStationReports.length > 0 ? (
                        selectedStationReports.map((report) => (
                          <article className="update-card" key={report.id}>
                            <div className="update-topline">
                              <span>
                                <Clock3 size={12} />
                                {formatRelativeTime(report.createdAt)}
                              </span>
                            </div>
                            <p>{report.message}</p>
                          </article>
                        ))
                      ) : (
                        <p className="panel-note">No recent updates for this station.</p>
                      )}
                    </div>
                  </div>

                  {recommendedRoute?.stationIds.includes(selectedStation.id) ? (
                    <div className="route-hint">
                      <CheckCircle2 size={16} />
                      <span>This station is part of the current recommended route.</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="loading-state">
                  <AlertTriangle size={18} />
                  Select a station to view details.
                </div>
              )}
            </motion.section>
          </div>
        </section>
      </main>

      <AssistantDock
        plannerDestinationId={plannerDestination}
        plannerOriginId={plannerOrigin}
        recommendedRoute={assistantRoute}
        selectedStation={selectedStation}
        snapshot={snapshot}
      />
    </div>
  );
}
