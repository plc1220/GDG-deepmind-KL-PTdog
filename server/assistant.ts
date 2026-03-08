import {GoogleGenAI} from '@google/genai';

import type {
  AssistantChatContext,
  AssistantChatRequest,
  AssistantChatResponse,
} from '../shared/assistant';
import type {InfrastructureState, LedgerSnapshot, LedgerStation} from '../shared/ledger';
import {getLedgerSnapshot} from './ledger';

const ASSISTANT_MODEL = 'gemini-2.0-flash';
const VERTEX_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? 'my-rd-coe-demo-gen-ai';
const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? 'asia-southeast1';

function getAiClient() {
  return new GoogleGenAI({
    vertexai: true,
    project: VERTEX_PROJECT,
    location: VERTEX_LOCATION,
  });
}

function getStation(snapshot: LedgerSnapshot, stationId: string | null | undefined) {
  return stationId ? snapshot.stations.find((station) => station.id === stationId) ?? null : null;
}

function formatInfrastructureLabel(label: string, status: InfrastructureState) {
  return `${label} ${status === 'up' ? 'clear' : status === 'degraded' ? 'limited' : 'offline'}`;
}

function summarizeStation(snapshot: LedgerSnapshot, station: LedgerStation) {
  const stationReports = snapshot.reports.filter((report) => report.stationId === station.id).slice(0, 2);
  const infrastructureSummary = [
    formatInfrastructureLabel('lifts', station.infrastructure.lifts),
    formatInfrastructureLabel('escalators', station.infrastructure.escalators),
    formatInfrastructureLabel('ramps', station.infrastructure.ramps),
  ].join(', ');
  const reportSummary =
    stationReports.length > 0
      ? `Latest note: ${stationReports[0].message}`
      : `No fresh community notes beyond the base station note: ${station.note}`;

  return `${station.name} is currently ${station.status}. ${infrastructureSummary}. ${reportSummary}`;
}

function summarizeNetwork(snapshot: LedgerSnapshot) {
  const criticalStations = snapshot.stations.filter((station) => station.status === 'critical');
  const degradedStations = snapshot.stations.filter((station) => station.status === 'degraded');
  const criticalNames =
    criticalStations.length > 0 ? criticalStations.map((station) => station.name).join(', ') : 'none';
  const degradedNames =
    degradedStations.length > 0 ? degradedStations.map((station) => station.name).join(', ') : 'none';
  const dispatchStation = getStation(snapshot, snapshot.dispatchNote.stationId);

  return `Network check: ${snapshot.metrics[0]?.value ?? 'n/a'} legibility, ${
    snapshot.metrics[1]?.value ?? '0'
  } lift outages, dispatch focus on ${dispatchStation?.name ?? snapshot.dispatchNote.stationId}. Critical stations: ${criticalNames}. Degraded stations: ${degradedNames}.`;
}

function summarizeRoute(snapshot: LedgerSnapshot, context: AssistantChatContext) {
  if (!context.recommendedRoute) {
    return 'No recommended route is available from the current planner selection.';
  }

  const riskStations = context.recommendedRoute.stationIds
    .map((stationId) => getStation(snapshot, stationId))
    .filter((station): station is LedgerStation => Boolean(station))
    .filter((station) => station.status !== 'operational')
    .map((station) => `${station.name} (${station.status})`);

  return `Current recommended route takes about ${context.recommendedRoute.totalMinutes} minutes via ${context.recommendedRoute.summary}.${riskStations.length > 0 ? ` Watch ${riskStations.join(', ')}.` : ' All monitored stops on that route are currently clear.'}`;
}

function buildSuggestions(snapshot: LedgerSnapshot, context: AssistantChatContext) {
  const selectedStation = getStation(snapshot, context.selectedStationId);
  const criticalStation = snapshot.stations.find((station) => station.status === 'critical') ?? null;

  return [
    selectedStation ? `What should I know about ${selectedStation.name}?` : 'Give me a network summary.',
    context.recommendedRoute
      ? 'Is the current recommended route safe for step-free travel?'
      : 'Which stations should riders avoid right now?',
    criticalStation ? `Why is ${criticalStation.name} risky right now?` : 'Where are the lift outages right now?',
  ];
}

function findMentionedStation(snapshot: LedgerSnapshot, question: string, context: AssistantChatContext) {
  const loweredQuestion = question.toLowerCase();
  const explicitMatch =
    snapshot.stations.find((station) => {
      const normalizedId = station.id.replace(/-/g, ' ');
      return (
        loweredQuestion.includes(station.name.toLowerCase()) ||
        loweredQuestion.includes(station.id.toLowerCase()) ||
        loweredQuestion.includes(normalizedId)
      );
    }) ?? null;

  if (explicitMatch) {
    return explicitMatch;
  }

  if (loweredQuestion.includes('this station') || loweredQuestion.includes('selected station')) {
    return getStation(snapshot, context.selectedStationId);
  }

  return null;
}

function fallbackReply(snapshot: LedgerSnapshot, request: AssistantChatRequest) {
  const latestUserMessage =
    [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const loweredQuestion = latestUserMessage.toLowerCase();
  const selectedStation = getStation(snapshot, request.context.selectedStationId);
  const mentionedStation = findMentionedStation(snapshot, latestUserMessage, request.context);

  if (
    loweredQuestion.includes('route') ||
    loweredQuestion.includes('travel') ||
    loweredQuestion.includes('planner') ||
    loweredQuestion.includes('go from')
  ) {
    return summarizeRoute(snapshot, request.context);
  }

  if (
    loweredQuestion.includes('lift') ||
    loweredQuestion.includes('elevator') ||
    loweredQuestion.includes('accessible')
  ) {
    const liftIssues = snapshot.stations.filter((station) => station.infrastructure.lifts !== 'up');
    if (mentionedStation) {
      return summarizeStation(snapshot, mentionedStation);
    }
    if (liftIssues.length === 0) {
      return 'All monitored stations currently show lifts as clear in the latest ledger.';
    }
    return `Lift watch: ${liftIssues.map((station) => `${station.name} (${station.infrastructure.lifts})`).join(', ')}. ${selectedStation ? `For the station you have open, ${summarizeStation(snapshot, selectedStation)}` : ''}`.trim();
  }

  if (
    loweredQuestion.includes('avoid') ||
    loweredQuestion.includes('risk') ||
    loweredQuestion.includes('worst') ||
    loweredQuestion.includes('problem')
  ) {
    const riskyStations = snapshot.stations.filter((station) => station.status === 'critical');
    if (riskyStations.length === 0) {
      return 'No monitored station is marked critical right now. The network still has some degraded points, but none are flagged avoid-level.';
    }
    return `Riders should be most careful around ${riskyStations.map((station) => station.name).join(', ')}. ${snapshot.dispatchNote.message}`;
  }

  if (mentionedStation) {
    return summarizeStation(snapshot, mentionedStation);
  }

  if (
    loweredQuestion.includes('summary') ||
    loweredQuestion.includes('status') ||
    loweredQuestion.includes('network') ||
    loweredQuestion.includes('now')
  ) {
    return `${summarizeNetwork(snapshot)} ${selectedStation ? summarizeStation(snapshot, selectedStation) : ''}`.trim();
  }

  return `${summarizeNetwork(snapshot)} ${request.context.recommendedRoute ? summarizeRoute(snapshot, request.context) : ''}`.trim();
}

function buildPrompt(snapshot: LedgerSnapshot, request: AssistantChatRequest) {
  const selectedStation = getStation(snapshot, request.context.selectedStationId);
  const promptContext = {
    fetchedAt: snapshot.fetchedAt,
    metrics: snapshot.metrics,
    dispatchNote: snapshot.dispatchNote,
    stations: snapshot.stations.map((station) => ({
      id: station.id,
      name: station.name,
      area: station.area,
      line: station.line,
      status: station.status,
      alert: station.alert,
      note: station.note,
      verifiedAt: station.verifiedAt,
      infrastructure: station.infrastructure,
      reportCount: station.reportCount,
    })),
    recentReports: snapshot.reports.slice(0, 8).map((report) => ({
      stationId: report.stationId,
      message: report.message,
      type: report.type,
      severity: report.severity,
      createdAt: report.createdAt,
      verified: report.verified,
    })),
    selectedStation,
    plannerContext: request.context,
  };

  const conversation = request.messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');

  return `You are PTdog Copilot, a grounded assistant for an accessibility-first transit status app.
Answer only from the snapshot and planner context below.
If the user asks for something not present in the data, say that it is not in the current ledger.
Keep the answer concise, practical, and suitable for riders. Do not invent future repairs or external operator facts.

Snapshot:
${JSON.stringify(promptContext, null, 2)}

Conversation:
${conversation}

Reply in plain text.`;
}

async function tryLiveReply(snapshot: LedgerSnapshot, request: AssistantChatRequest) {
  const ai = getAiClient();
  if (!ai) {
    return null;
  }

  const response = await ai.models.generateContent({
    model: ASSISTANT_MODEL,
    contents: buildPrompt(snapshot, request),
  });

  const text = response.text?.trim();
  return text || null;
}

export async function createAssistantReply(
  request: AssistantChatRequest,
): Promise<AssistantChatResponse> {
  const snapshot = await getLedgerSnapshot();
  const suggestions = buildSuggestions(snapshot, request.context);

  try {
    const liveReply = await tryLiveReply(snapshot, request);
    if (liveReply) {
      return {
        reply: liveReply,
        mode: 'live',
        model: ASSISTANT_MODEL,
        suggestions,
        generatedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    console.warn('Assistant live reply failed, falling back to snapshot mode.', error);
  }

  return {
    reply: fallbackReply(snapshot, request),
    mode: 'fallback',
    model: 'snapshot-logic',
    suggestions,
    generatedAt: new Date().toISOString(),
  };
}
