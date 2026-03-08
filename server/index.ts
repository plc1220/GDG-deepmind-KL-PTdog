import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {createAssistantReply} from './assistant';
import {fetchFeedOverview, fetchRealtimeFeed, fetchStaticFeed} from './gtfs';
import {createReport, getLedgerSnapshot} from './ledger';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

app.use(express.json());

function getFeedQuery(query: express.Request['query']) {
  const feedPath = typeof query.feedPath === 'string' ? query.feedPath : '';
  const category = typeof query.category === 'string' ? query.category : undefined;
  const limit = typeof query.limit === 'string' ? Number(query.limit) : 100;

  if (!feedPath.trim()) {
    throw new Error('feedPath query parameter is required');
  }

  return {
    feedPath,
    category,
    limit: Number.isFinite(limit) ? limit : 100,
  };
}

function getOverviewQuery(query: express.Request['query']) {
  const category = typeof query.category === 'string' ? query.category : undefined;
  const staticFeedPath =
    typeof query.staticFeedPath === 'string'
      ? query.staticFeedPath
      : typeof query.feedPath === 'string'
        ? query.feedPath.replace(/^vehicle-position\//, '')
        : '';
  const realtimeFeedPath =
    typeof query.realtimeFeedPath === 'string'
      ? query.realtimeFeedPath
      : typeof query.feedPath === 'string'
        ? query.feedPath.startsWith('vehicle-position/')
          ? query.feedPath
          : `vehicle-position/${query.feedPath}`
        : '';
  const limit = typeof query.limit === 'string' ? Number(query.limit) : 100;

  if (!staticFeedPath.trim()) {
    throw new Error('staticFeedPath or feedPath query parameter is required');
  }

  if (!realtimeFeedPath.trim()) {
    throw new Error('realtimeFeedPath or feedPath query parameter is required');
  }

  return {
    category,
    staticFeedPath,
    realtimeFeedPath,
    limit: Number.isFinite(limit) ? limit : 100,
  };
}

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'ptdog-backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ledger', async (_request, response) => {
  try {
    const snapshot = await getLedgerSnapshot();
    response.json(snapshot);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/ledger/reports', async (request, response) => {
  try {
    await createReport(request.body);
    const snapshot = await getLedgerSnapshot();
    response.status(201).json(snapshot);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/assistant/chat', async (request, response) => {
  try {
    const payload = await createAssistantReply(request.body);
    response.json(payload);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/gtfs/static', async (request, response) => {
  try {
    const {feedPath, category, limit} = getFeedQuery(request.query);
    const payload = await fetchStaticFeed({feedPath, category}, limit);
    response.json(payload);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/gtfs/realtime', async (request, response) => {
  try {
    const {feedPath, category, limit} = getFeedQuery(request.query);
    const payload = await fetchRealtimeFeed({feedPath, category}, limit);
    response.json(payload);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/gtfs/overview', async (request, response) => {
  try {
    const {category, staticFeedPath, realtimeFeedPath, limit} = getOverviewQuery(request.query);
    const payload = await fetchFeedOverview(
      {
        staticFeedPath,
        realtimeFeedPath,
        category,
      },
      limit,
    );
    response.json(payload);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.use(express.static(distDir));

app.get('*', (request, response, next) => {
  if (request.path.startsWith('/api/')) {
    next();
    return;
  }

  response.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Backend listening on http://127.0.0.1:${port}`);
});
