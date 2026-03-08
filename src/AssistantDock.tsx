import React, {useEffect, useMemo, useRef, useState} from 'react';
import {LoaderCircle, MessageCircleMore, SendHorizontal, Sparkles, X} from 'lucide-react';

import type {
  AssistantChatMessage,
  AssistantChatResponse,
  AssistantRouteContext,
} from '../shared/assistant';
import type {LedgerSnapshot, LedgerStation} from '../shared/ledger';

type AssistantDockProps = {
  snapshot: LedgerSnapshot | null;
  selectedStation: LedgerStation | null;
  plannerOriginId: string | null;
  plannerDestinationId: string | null;
  recommendedRoute: AssistantRouteContext | null;
};

const initialAssistantMessage: AssistantChatMessage = {
  role: 'assistant',
  content:
    'Ask about the current network, the station you have open, or whether the recommended route still looks step-free.',
};

function buildDefaultSuggestions({
  selectedStation,
  recommendedRoute,
}: Pick<AssistantDockProps, 'selectedStation' | 'recommendedRoute'>) {
  return [
    selectedStation ? `What should I know about ${selectedStation.name}?` : 'Give me a quick network summary.',
    recommendedRoute
      ? 'Is the current recommended route safe for step-free travel?'
      : 'Which stations should riders avoid right now?',
    'Where are the lift outages right now?',
  ];
}

export default function AssistantDock({
  snapshot,
  selectedStation,
  plannerOriginId,
  plannerDestinationId,
  recommendedRoute,
}: AssistantDockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<AssistantChatMessage[]>([initialAssistantMessage]);
  const [sending, setSending] = useState(false);
  const [assistantMeta, setAssistantMeta] = useState<Pick<
    AssistantChatResponse,
    'mode' | 'model' | 'generatedAt'
  > | null>(null);
  const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fallbackSuggestions = useMemo(
    () => buildDefaultSuggestions({selectedStation, recommendedRoute}),
    [recommendedRoute, selectedStation],
  );
  const suggestions = serverSuggestions.length > 0 ? serverSuggestions : fallbackSuggestions;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight, behavior: 'smooth'});
  }, [isOpen, messages, sending]);

  async function submitMessage(rawPrompt: string) {
    const prompt = rawPrompt.trim();
    if (!prompt || sending || !snapshot) {
      return;
    }

    const nextMessages = [...messages, {role: 'user' as const, content: prompt}];
    setMessages(nextMessages);
    setDraft('');
    setSending(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages.slice(-8),
          context: {
            selectedStationId: selectedStation?.id ?? null,
            plannerOriginId,
            plannerDestinationId,
            recommendedRoute,
          },
        }),
      });
      const payload = (await response.json()) as AssistantChatResponse | {error?: string};

      if (!response.ok || !('reply' in payload)) {
        throw new Error(
          'error' in payload ? payload.error ?? 'Unable to reach assistant' : 'Unable to reach assistant',
        );
      }

      setMessages((current) => [...current, {role: 'assistant', content: payload.reply}]);
      setAssistantMeta({
        mode: payload.mode,
        model: payload.model,
        generatedAt: payload.generatedAt,
      });
      setServerSuggestions(payload.suggestions);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            error instanceof Error
              ? `I couldn't reach the assistant just now: ${error.message}`
              : "I couldn't reach the assistant just now.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        aria-controls="assistant-dock"
        aria-expanded={isOpen}
        className={`assistant-launcher${isOpen ? ' is-open' : ''}`}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="assistant-launcher-icon">
          <Sparkles size={18} />
        </span>
        <span className="assistant-launcher-copy">
          <strong>Ask PTdog</strong>
          <span>{snapshot ? 'Grounded on live status data' : 'Waiting for current snapshot'}</span>
        </span>
      </button>

      <aside
        aria-hidden={!isOpen}
        className={`assistant-dock${isOpen ? ' is-open' : ''}`}
        id="assistant-dock"
      >
        <div className="assistant-dock-head">
          <div>
            <p className="eyebrow">GenAI layer</p>
            <h3>Transit copilot</h3>
          </div>
          <button className="assistant-close" onClick={() => setIsOpen(false)} type="button">
            <X size={16} />
          </button>
        </div>

        <p className="assistant-subhead">
          Ask for a station recap, lift risks, or a plain-language read on the current route.
        </p>

        <div className="assistant-suggestion-row">
          {suggestions.map((suggestion) => (
            <button
              className="assistant-suggestion"
              key={suggestion}
              onClick={() => void submitMessage(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="assistant-thread" ref={scrollRef}>
          {messages.map((message, index) => (
            <article
              className={`assistant-bubble assistant-${message.role}`}
              key={`${message.role}-${index}-${message.content.slice(0, 18)}`}
            >
              <span className="assistant-bubble-label">
                {message.role === 'assistant' ? (
                  <>
                    <MessageCircleMore size={14} />
                    PTdog
                  </>
                ) : (
                  'You'
                )}
              </span>
              <p>{message.content}</p>
            </article>
          ))}

          {sending ? (
            <div className="assistant-loading">
              <LoaderCircle className="spin" size={16} />
              thinking with current ledger
            </div>
          ) : null}
        </div>

        <form
          className="assistant-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMessage(draft);
          }}
        >
          <textarea
            disabled={!snapshot || sending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about this station, the route, or where access breaks down."
            rows={3}
            value={draft}
          />
          <div className="assistant-compose-foot">
            <div className="assistant-meta">
              <span>{assistantMeta?.mode === 'live' ? 'Gemini live' : 'Snapshot mode'}</span>
              <span>{assistantMeta?.model ?? 'grounded fallback ready'}</span>
            </div>
            <button disabled={!snapshot || sending || !draft.trim()} type="submit">
              Ask
              <SendHorizontal size={15} />
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
