export type AssistantChatRole = 'user' | 'assistant';
export type AssistantMode = 'live' | 'fallback';

export type AssistantChatMessage = {
  role: AssistantChatRole;
  content: string;
};

export type AssistantRouteContext = {
  stationIds: string[];
  totalMinutes: number;
  summary: string;
};

export type AssistantChatContext = {
  selectedStationId: string | null;
  plannerOriginId: string | null;
  plannerDestinationId: string | null;
  recommendedRoute: AssistantRouteContext | null;
};

export type AssistantChatRequest = {
  messages: AssistantChatMessage[];
  context: AssistantChatContext;
};

export type AssistantChatResponse = {
  reply: string;
  mode: AssistantMode;
  model: string;
  suggestions: string[];
  generatedAt: string;
};
