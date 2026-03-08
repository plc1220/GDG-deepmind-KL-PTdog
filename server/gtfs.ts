import AdmZip from 'adm-zip';
import {parse} from 'csv-parse/sync';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const GTFS_STATIC_BASE_URL = 'https://api.data.gov.my/gtfs-static';
const GTFS_REALTIME_BASE_URL = 'https://api.data.gov.my/gtfs-realtime';
const DEFAULT_CACHE_TTL_MS = 60_000;
const MAX_ROWS = 500;

type FeedKind = 'static' | 'realtime';

type FeedQuery = {
  category?: string;
  feedPath: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type CsvRecord = Record<string, string>;

const responseCache = new Map<string, CacheEntry<unknown>>();

function getCacheKey(kind: FeedKind, query: FeedQuery) {
  return `${kind}:${query.feedPath}:${query.category ?? ''}`;
}

function getCached<T>(key: string) {
  const entry = responseCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    return null;
  }

  if (entry.expiresAt < Date.now()) {
    responseCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCached<T>(key: string, value: T, ttlMs = DEFAULT_CACHE_TTL_MS) {
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function normalizeFeedPath(feedPath: string) {
  return feedPath
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .join('/');
}

function buildGtfsUrl(kind: FeedKind, query: FeedQuery) {
  const feedPath = normalizeFeedPath(query.feedPath);
  if (!feedPath) {
    throw new Error('feedPath is required');
  }

  const root = kind === 'static' ? GTFS_STATIC_BASE_URL : GTFS_REALTIME_BASE_URL;
  const url = new URL(`${root}/${feedPath}/`);
  if (query.category) {
    url.searchParams.set('category', query.category);
  }
  return url.toString();
}

async function fetchBuffer(url: string) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: '*/*',
      'User-Agent': 'PTdog/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function parseCsv<T extends CsvRecord = CsvRecord>(raw: Buffer | null) {
  if (!raw) {
    return [] as T[];
  }

  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as T[];
}

function countRows(raw: Buffer | null) {
  if (!raw) {
    return 0;
  }

  const text = raw.toString('utf8').trim();
  if (!text) {
    return 0;
  }

  return Math.max(text.split(/\r?\n/).length - 1, 0);
}

function getZipBuffer(zip: AdmZip, entryName: string) {
  const entry = zip.getEntry(entryName);
  return entry ? zip.readFile(entry) : null;
}

function buildStaticPayload(input: {
  agency: CsvRecord[];
  routes: CsvRecord[];
  stops: CsvRecord[];
  trips: CsvRecord[];
  stopTimesCount: number;
  shapesCount: number;
  frequenciesCount: number;
  calendarCount: number;
  sourceUrl: string;
  category?: string;
  feedPath: string;
}) {
  return {
    fetchedAt: new Date().toISOString(),
    sourceUrl: input.sourceUrl,
    feedPath: input.feedPath,
    category: input.category ?? null,
    dataset: {
      agency: input.agency,
      counts: {
        agency: input.agency.length,
        routes: input.routes.length,
        stops: input.stops.length,
        trips: input.trips.length,
        stopTimes: input.stopTimesCount,
        shapes: input.shapesCount,
        frequencies: input.frequenciesCount,
        calendar: input.calendarCount,
      },
      routes: input.routes,
      stops: input.stops,
      trips: input.trips,
    },
  };
}

export async function fetchStaticFeed(query: FeedQuery, limit = 100) {
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_ROWS);
  const cacheKey = getCacheKey('static', query);
  const cached = getCached<ReturnType<typeof buildStaticPayload>>(cacheKey);
  if (cached) {
    return {
      ...cached,
      dataset: {
        ...cached.dataset,
        routes: cached.dataset.routes.slice(0, cappedLimit),
        stops: cached.dataset.stops.slice(0, cappedLimit),
        trips: cached.dataset.trips.slice(0, cappedLimit),
      },
    };
  }

  const sourceUrl = buildGtfsUrl('static', query);
  const zipBuffer = await fetchBuffer(sourceUrl);
  const zip = new AdmZip(zipBuffer);

  const agency = parseCsv(getZipBuffer(zip, 'agency.txt'));
  const routes = parseCsv(getZipBuffer(zip, 'routes.txt'));
  const stops = parseCsv(getZipBuffer(zip, 'stops.txt'));
  const trips = parseCsv(getZipBuffer(zip, 'trips.txt'));

  const payload = buildStaticPayload({
    agency,
    routes,
    stops,
    trips,
    stopTimesCount: countRows(getZipBuffer(zip, 'stop_times.txt')),
    shapesCount: countRows(getZipBuffer(zip, 'shapes.txt')),
    frequenciesCount: countRows(getZipBuffer(zip, 'frequencies.txt')),
    calendarCount: countRows(getZipBuffer(zip, 'calendar.txt')),
    sourceUrl,
    category: query.category,
    feedPath: normalizeFeedPath(query.feedPath),
  });

  setCached(cacheKey, payload);

  return {
    ...payload,
    dataset: {
      ...payload.dataset,
      routes: payload.dataset.routes.slice(0, cappedLimit),
      stops: payload.dataset.stops.slice(0, cappedLimit),
      trips: payload.dataset.trips.slice(0, cappedLimit),
    },
  };
}

async function decodeRealtimeFeed(sourceUrl: string, query: FeedQuery) {
  const buffer = await fetchBuffer(sourceUrl);
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const entities = (feed.entity ?? []).map((entity) => ({
    id: entity.id ?? null,
    isDeleted: entity.isDeleted ?? false,
    tripUpdate: entity.tripUpdate ?? null,
    alert: entity.alert ?? null,
    vehicle: entity.vehicle
      ? {
          trip: entity.vehicle.trip ?? null,
          vehicle: entity.vehicle.vehicle ?? null,
          position: entity.vehicle.position ?? null,
          currentStopSequence: entity.vehicle.currentStopSequence ?? null,
          stopId: entity.vehicle.stopId ?? null,
          currentStatus: entity.vehicle.currentStatus ?? null,
          timestamp: entity.vehicle.timestamp
            ? new Date(Number(entity.vehicle.timestamp) * 1000).toISOString()
            : null,
          congestionLevel: entity.vehicle.congestionLevel ?? null,
          occupancyStatus: entity.vehicle.occupancyStatus ?? null,
          occupancyPercentage: entity.vehicle.occupancyPercentage ?? null,
        }
      : null,
  }));

  return {
    fetchedAt: new Date().toISOString(),
    sourceUrl,
    feedPath: normalizeFeedPath(query.feedPath),
    category: query.category ?? null,
    header: {
      gtfsRealtimeVersion: feed.header?.gtfsRealtimeVersion ?? null,
      incrementality: feed.header?.incrementality ?? null,
      timestamp: feed.header?.timestamp ? new Date(Number(feed.header.timestamp) * 1000).toISOString() : null,
    },
    entityCount: entities.length,
    entities,
  };
}

export async function fetchRealtimeFeed(query: FeedQuery, limit = 100) {
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_ROWS);
  const cacheKey = getCacheKey('realtime', query);
  const cached = getCached<Awaited<ReturnType<typeof decodeRealtimeFeed>>>(cacheKey);
  if (cached) {
    return {
      ...cached,
      entities: cached.entities.slice(0, cappedLimit),
    };
  }

  const sourceUrl = buildGtfsUrl('realtime', query);
  const payload = await decodeRealtimeFeed(sourceUrl, query);
  setCached(cacheKey, payload, 15_000);

  return {
    ...payload,
    entities: payload.entities.slice(0, cappedLimit),
  };
}

export async function fetchFeedOverview(
  query: {
    category?: string;
    staticFeedPath: string;
    realtimeFeedPath: string;
  },
  limit = 100,
) {
  const [staticFeed, realtimeFeed] = await Promise.all([
    fetchStaticFeed({feedPath: query.staticFeedPath, category: query.category}, MAX_ROWS),
    fetchRealtimeFeed({feedPath: query.realtimeFeedPath, category: query.category}, MAX_ROWS),
  ]);

  const tripsById = new Map(staticFeed.dataset.trips.map((trip) => [trip.trip_id, trip]));
  const routesById = new Map(staticFeed.dataset.routes.map((route) => [route.route_id, route]));
  const stopsById = new Map(staticFeed.dataset.stops.map((stop) => [stop.stop_id, stop]));

  const vehicles = realtimeFeed.entities
    .filter((entity) => entity.vehicle)
    .map((entity) => {
      const vehicle = entity.vehicle!;
      const tripId = vehicle.trip?.tripId ?? null;
      const trip = tripId ? tripsById.get(tripId) : null;
      const route = trip?.route_id ? routesById.get(trip.route_id) : null;
      const stop = vehicle.stopId ? stopsById.get(vehicle.stopId) : null;

      return {
        entityId: entity.id,
        tripId,
        routeId: trip?.route_id ?? null,
        routeShortName: route?.route_short_name ?? null,
        routeLongName: route?.route_long_name ?? null,
        tripHeadsign: trip?.trip_headsign ?? null,
        stopId: vehicle.stopId ?? null,
        stopName: stop?.stop_name ?? null,
        vehicleId: vehicle.vehicle?.id ?? null,
        vehicleLabel: vehicle.vehicle?.label ?? null,
        licensePlate: vehicle.vehicle?.licensePlate ?? null,
        latitude: vehicle.position?.latitude ?? null,
        longitude: vehicle.position?.longitude ?? null,
        bearing: vehicle.position?.bearing ?? null,
        speed: vehicle.position?.speed ?? null,
        currentStatus: vehicle.currentStatus ?? null,
        occupancyStatus: vehicle.occupancyStatus ?? null,
        occupancyPercentage: vehicle.occupancyPercentage ?? null,
        timestamp: vehicle.timestamp,
      };
    })
    .slice(0, Math.min(Math.max(limit, 1), MAX_ROWS));

  return {
    fetchedAt: new Date().toISOString(),
    source: {
      staticFeedPath: normalizeFeedPath(query.staticFeedPath),
      realtimeFeedPath: normalizeFeedPath(query.realtimeFeedPath),
      category: query.category ?? null,
      staticUrl: staticFeed.sourceUrl,
      realtimeUrl: realtimeFeed.sourceUrl,
    },
    counts: {
      routes: staticFeed.dataset.counts.routes,
      stops: staticFeed.dataset.counts.stops,
      trips: staticFeed.dataset.counts.trips,
      realtimeEntities: realtimeFeed.entityCount,
      vehicles: vehicles.length,
    },
    header: realtimeFeed.header,
    vehicles,
  };
}
