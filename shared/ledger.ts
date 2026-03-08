export const INFRA_KEYS = ['lifts', 'escalators', 'ramps'] as const;
export const INFRA_STATES = ['up', 'degraded', 'down'] as const;
export const STATION_STATUSES = ['operational', 'degraded', 'critical'] as const;
export const REPORT_TYPES = ['lift', 'escalator', 'ramp', 'crowd', 'alert'] as const;

export type InfrastructureKey = (typeof INFRA_KEYS)[number];
export type InfrastructureState = (typeof INFRA_STATES)[number];
export type StationStatus = (typeof STATION_STATUSES)[number];
export type ReportType = (typeof REPORT_TYPES)[number];

export type InfrastructureStateMap = Record<InfrastructureKey, InfrastructureState>;

export type StationCoordinates = {
  lat: number;
  lng: number;
};

export type LedgerReport = {
  id: string;
  stationId: string;
  author: string;
  message: string;
  type: ReportType;
  severity: StationStatus;
  createdAt: string;
  verified: boolean;
  source: 'seed' | 'user';
  infrastructure: Partial<InfrastructureStateMap>;
};

export type LedgerStation = {
  id: string;
  name: string;
  area: string;
  line: string;
  coordinates: StationCoordinates;
  status: StationStatus;
  alert: string | null;
  note: string;
  verifiedAt: string;
  infrastructure: InfrastructureStateMap;
  reportCount: number;
  latestReportId: string | null;
};

export type LedgerMetric = {
  label: string;
  value: string;
  sub: string;
  detail: string;
  tone: StationStatus | 'neutral';
};

export type DispatchNote = {
  stationId: string;
  title: string;
  message: string;
  confidence: number;
  syncedAt: string;
};

export type RouteConnection = {
  from: string;
  to: string;
  line: string;
  color: string;
  minutes: number;
};

export type LedgerSnapshot = {
  fetchedAt: string;
  stations: LedgerStation[];
  reports: LedgerReport[];
  metrics: LedgerMetric[];
  dispatchNote: DispatchNote;
  connections: RouteConnection[];
};

export type CreateReportInput = {
  stationId: string;
  author: string;
  message: string;
  type: ReportType;
  severity?: StationStatus;
  infrastructure?: Partial<InfrastructureStateMap>;
};
