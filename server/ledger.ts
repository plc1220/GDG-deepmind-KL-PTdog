import {randomUUID} from 'node:crypto';

import {
  INFRA_KEYS,
  INFRA_STATES,
  REPORT_TYPES,
  STATION_STATUSES,
  type CreateReportInput,
  type DispatchNote,
  type InfrastructureKey,
  type InfrastructureState,
  type InfrastructureStateMap,
  type LedgerMetric,
  type LedgerReport,
  type LedgerSnapshot,
  type LedgerStation,
  type RouteConnection,
  type StationStatus,
} from '../shared/ledger';
import {getLedgerStore} from './storage';

type StationSeed = {
  id: string;
  name: string;
  area: string;
  line: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  note: string;
  officialSyncOffsetMinutes: number;
  infrastructure: InfrastructureStateMap;
};

const STATION_SEEDS: StationSeed[] = [
  {
    id: 'pasar-seni',
    name: 'Pasar Seni',
    area: 'Central interchange',
    line: 'LRT Kelana Jaya / MRT Kajang',
    coordinates: {lat: 3.1428, lng: 101.6953},
    note: 'Street-level reroute remains available, but adds roughly 11 minutes.',
    officialSyncOffsetMinutes: 2,
    infrastructure: {
      lifts: 'down',
      escalators: 'up',
      ramps: 'up',
    },
  },
  {
    id: 'kl-sentral',
    name: 'KL Sentral',
    area: 'Rail hub',
    line: 'Interchange hub',
    coordinates: {lat: 3.1357, lng: 101.6865},
    note: 'Primary platform-to-concourse paths remain clear across the hub.',
    officialSyncOffsetMinutes: 4,
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up',
    },
  },
  {
    id: 'masjid-jamek',
    name: 'Masjid Jamek',
    area: 'Core ring',
    line: 'LRT Kelana Jaya / Ampang',
    coordinates: {lat: 3.1495, lng: 101.695},
    note: 'North corridor keeps the interchange step-free despite slower flow.',
    officialSyncOffsetMinutes: 8,
    infrastructure: {
      lifts: 'up',
      escalators: 'degraded',
      ramps: 'up',
    },
  },
  {
    id: 'ttdi',
    name: 'TTDI',
    area: 'North corridor',
    line: 'MRT Kajang',
    coordinates: {lat: 3.1362, lng: 101.6297},
    note: 'Lower concourse crowding is light this hour.',
    officialSyncOffsetMinutes: 12,
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up',
    },
  },
  {
    id: 'bukit-bintang',
    name: 'Bukit Bintang',
    area: 'Retail core',
    line: 'MRT Kajang / Monorail',
    coordinates: {lat: 3.1463, lng: 101.7114},
    note: 'Bridge access to the monorail remains stable after the morning check.',
    officialSyncOffsetMinutes: 6,
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up',
    },
  },
  {
    id: 'klcc',
    name: 'KLCC',
    area: 'Park-side corridor',
    line: 'LRT Kelana Jaya',
    coordinates: {lat: 3.1588, lng: 101.7122},
    note: 'Entrance A and the park-side lifts are responding normally.',
    officialSyncOffsetMinutes: 5,
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up',
    },
  },
];

const ROUTE_CONNECTIONS: RouteConnection[] = [
  {
    from: 'ttdi',
    to: 'bukit-bintang',
    line: 'MRT Kajang',
    color: '#2f6d68',
    minutes: 9,
  },
  {
    from: 'bukit-bintang',
    to: 'pasar-seni',
    line: 'MRT Kajang',
    color: '#2f6d68',
    minutes: 6,
  },
  {
    from: 'pasar-seni',
    to: 'kl-sentral',
    line: 'Interchange link',
    color: '#7b6a57',
    minutes: 5,
  },
  {
    from: 'pasar-seni',
    to: 'masjid-jamek',
    line: 'LRT Kelana Jaya',
    color: '#9d402e',
    minutes: 4,
  },
  {
    from: 'masjid-jamek',
    to: 'klcc',
    line: 'LRT Kelana Jaya',
    color: '#9d402e',
    minutes: 8,
  },
];

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const SEED_REPORTS: LedgerReport[] = [
  {
    id: 'seed-ttdi-lift',
    stationId: 'ttdi',
    author: 'Field note 18',
    message: 'Platform lift is stalled at the upper landing. Staff have been notified.',
    type: 'lift',
    severity: 'critical',
    createdAt: minutesAgoIso(2),
    verified: true,
    source: 'seed',
    infrastructure: {
      lifts: 'down',
    },
  },
  {
    id: 'seed-pasar-seni-transfer',
    stationId: 'pasar-seni',
    author: 'Community desk',
    message: 'Transfer lift remains unavailable. Street crossing is still the safest detour.',
    type: 'alert',
    severity: 'critical',
    createdAt: minutesAgoIso(15),
    verified: true,
    source: 'seed',
    infrastructure: {
      lifts: 'down',
    },
  },
  {
    id: 'seed-kl-sentral-watch',
    stationId: 'kl-sentral',
    author: 'Volunteer watch',
    message: 'Escalator near the ERL entrance is noisy, but step-free access is unaffected.',
    type: 'escalator',
    severity: 'operational',
    createdAt: minutesAgoIso(45),
    verified: true,
    source: 'seed',
    infrastructure: {
      escalators: 'degraded',
    },
  },
  {
    id: 'seed-masjid-jamek-crowd',
    stationId: 'masjid-jamek',
    author: 'Station watch',
    message: 'Gate C maintenance is still narrowing circulation; expect slower transfers.',
    type: 'crowd',
    severity: 'degraded',
    createdAt: minutesAgoIso(8),
    verified: true,
    source: 'seed',
    infrastructure: {
      escalators: 'degraded',
    },
  },
];

const severityRank: Record<StationStatus, number> = {
  operational: 0,
  degraded: 1,
  critical: 2,
};

function isInfrastructureState(value: unknown): value is InfrastructureState {
  return typeof value === 'string' && INFRA_STATES.includes(value as InfrastructureState);
}

function isStationStatus(value: unknown): value is StationStatus {
  return typeof value === 'string' && STATION_STATUSES.includes(value as StationStatus);
}

function normalizeInfrastructure(
  value: Partial<Record<InfrastructureKey, unknown>> | undefined,
) {
  if (!value) {
    return {};
  }

  const normalized: Partial<InfrastructureStateMap> = {};
  for (const key of INFRA_KEYS) {
    const state = value[key];
    if (isInfrastructureState(state)) {
      normalized[key] = state;
    }
  }
  return normalized;
}

function mergeInfrastructure(
  base: InfrastructureStateMap,
  reports: LedgerReport[],
): InfrastructureStateMap {
  const next = {...base};
  const orderedReports = [...reports].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  for (const report of orderedReports) {
    for (const key of INFRA_KEYS) {
      const state = report.infrastructure[key];
      if (state) {
        next[key] = state;
      }
    }
  }

  return next;
}

function deriveStationStatus(
  infrastructure: InfrastructureStateMap,
  reports: LedgerReport[],
): StationStatus {
  let status: StationStatus = 'operational';

  if (Object.values(infrastructure).includes('down')) {
    status = 'critical';
  } else if (Object.values(infrastructure).includes('degraded')) {
    status = 'degraded';
  }

  for (const report of reports) {
    if (severityRank[report.severity] > severityRank[status]) {
      status = report.severity;
    }
  }

  return status;
}

function buildMetrics(stations: LedgerStation[], reports: LedgerReport[]): LedgerMetric[] {
  const operationalCount = stations.filter((station) => station.status === 'operational').length;
  const liftOutageCount = stations.filter((station) => station.infrastructure.lifts === 'down').length;
  const recentCrowdReports = reports.filter((report) => {
    if (report.type !== 'crowd' && report.type !== 'alert') {
      return false;
    }
    return Date.now() - new Date(report.createdAt).getTime() <= 2 * 60 * 60_000;
  }).length;
  const legibilityScore = Math.round((operationalCount / stations.length) * 100);
  const crowdPressure =
    recentCrowdReports >= 3 ? 'High' : recentCrowdReports >= 1 ? 'Moderate' : 'Low';

  return [
    {
      label: 'Network legibility',
      value: `${legibilityScore}%`,
      sub: operationalCount >= stations.length - 1 ? 'stable' : 'fragile',
      detail: `${stations.length - operationalCount} monitored stations still need intervention.`,
      tone: operationalCount >= stations.length - 1 ? 'operational' : 'degraded',
    },
    {
      label: 'Lift outages',
      value: liftOutageCount.toString().padStart(2, '0'),
      sub: liftOutageCount > 0 ? 'priority watch' : 'clear',
      detail:
        liftOutageCount > 0
          ? `${liftOutageCount} stations have a lift fully offline in the latest ledger.`
          : 'No monitored stations currently report a lift outage.',
      tone: liftOutageCount > 0 ? 'critical' : 'operational',
    },
    {
      label: 'Crowd pressure',
      value: crowdPressure,
      sub: `${recentCrowdReports} fresh notes`,
      detail: 'Derived from recent crowd and alert annotations across the monitored ring.',
      tone: recentCrowdReports >= 3 ? 'critical' : recentCrowdReports >= 1 ? 'degraded' : 'neutral',
    },
  ];
}

function buildDispatchNote(stations: LedgerStation[], reports: LedgerReport[]): DispatchNote {
  const mostCriticalStation =
    [...stations].sort((left, right) => severityRank[right.status] - severityRank[left.status])[0] ??
    stations[0];
  const latestReport = reports.find((report) => report.stationId === mostCriticalStation.id);

  return {
    stationId: mostCriticalStation.id,
    title: `${mostCriticalStation.name} remains the system hinge.`,
    message:
      latestReport?.message ??
      `${mostCriticalStation.name} is carrying the highest access risk in the current ledger.`,
    confidence: latestReport?.verified ? 0.98 : 0.82,
    syncedAt: latestReport?.createdAt ?? mostCriticalStation.verifiedAt,
  };
}

async function loadPersistedReports() {
  const persisted = await getLedgerStore().read();
  return persisted.reports;
}

async function savePersistedReports(reports: LedgerReport[]) {
  await getLedgerStore().write({reports});
}

export async function getLedgerSnapshot(): Promise<LedgerSnapshot> {
  const userReports = await loadPersistedReports();
  const reports = [...SEED_REPORTS, ...userReports].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  const stations = STATION_SEEDS.map<LedgerStation>((seed) => {
    const stationReports = reports.filter((report) => report.stationId === seed.id);
    const infrastructure = mergeInfrastructure(seed.infrastructure, stationReports);
    const status = deriveStationStatus(infrastructure, stationReports);
    const latestReport = stationReports[0];

    return {
      id: seed.id,
      name: seed.name,
      area: seed.area,
      line: seed.line,
      coordinates: seed.coordinates,
      status,
      alert: latestReport && latestReport.severity !== 'operational' ? latestReport.message : null,
      note: seed.note,
      verifiedAt: latestReport?.createdAt ?? minutesAgoIso(seed.officialSyncOffsetMinutes),
      infrastructure,
      reportCount: stationReports.length,
      latestReportId: latestReport?.id ?? null,
    };
  });

  const sortedStations = [...stations].sort((left, right) => {
    const severityDiff = severityRank[right.status] - severityRank[left.status];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    fetchedAt: new Date().toISOString(),
    stations: sortedStations,
    reports,
    metrics: buildMetrics(sortedStations, reports),
    dispatchNote: buildDispatchNote(sortedStations, reports),
    connections: ROUTE_CONNECTIONS,
  };
}

export function listSeedStations() {
  return STATION_SEEDS;
}

export async function createReport(input: CreateReportInput) {
  const station = STATION_SEEDS.find((entry) => entry.id === input.stationId);
  if (!station) {
    throw new Error('Unknown station');
  }

  const author = input.author.trim();
  const message = input.message.trim();
  if (!author) {
    throw new Error('author is required');
  }
  if (!message) {
    throw new Error('message is required');
  }

  const type = REPORT_TYPES.includes(input.type) ? input.type : 'alert';
  const infrastructure = normalizeInfrastructure(input.infrastructure);
  const severity =
    input.severity && isStationStatus(input.severity)
      ? input.severity
      : Object.values(infrastructure).includes('down')
        ? 'critical'
        : Object.values(infrastructure).includes('degraded')
          ? 'degraded'
          : 'operational';

  const report: LedgerReport = {
    id: randomUUID(),
    stationId: station.id,
    author,
    message,
    type,
    severity,
    createdAt: new Date().toISOString(),
    verified: false,
    source: 'user',
    infrastructure,
  };

  const existingReports = await loadPersistedReports();
  await savePersistedReports([report, ...existingReports]);

  return report;
}
