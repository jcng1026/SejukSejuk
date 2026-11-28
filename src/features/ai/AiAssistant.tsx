"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import type { Result } from "@/lib/result";
import type { Role } from "@/lib/roles";

import type { ChatAnswer } from "./pipeline";
import type { Source } from "./tools";

const EXAMPLES: Record<Role, string[]> = {
  technician: [
    "How many jobs did I complete this week?",
    "What jobs do I have this week?",
    "Are there open flags on my jobs?",
  ],
  admin: [
    "How many jobs were completed today?",
    "Who might be overloaded next week?",
    "Show open high flags this week",
  ],
  manager: [
    "Which technician completed the most jobs this week?",
    "What was revenue last week by technician?",
    "Who might be overloaded next week?",
  ],
};

/** FR-AI-6: three earlier exchanges at most, each trimmed to what the server accepts. */
const HISTORY_MESSAGES = 6;
const MAX_CONTENT = 500;

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  /** Left out of the history sent back: a refused question would block every later one. */
  isExcluded?: boolean;
  isError?: boolean;
}

/** "Based on: tool, period" (FR-AI-5), one entry per tool call. */
function sourcesLine(sources: Source[]): string {
  return sources
    .map((source) => (source.period ? `${source.tool}, ${source.period}` : source.tool))
    .join("; ");
}

async function ask(message: string, history: Message[]): Promise<Result<ChatAnswer>> {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history: history
        .filter((entry) => !entry.isExcluded)
        .slice(-HISTORY_MESSAGES)
        .map((entry) => ({ role: entry.role, content: entry.content.slice(0, MAX_CONTENT) })),
    }),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as Result<ChatAnswer> | null;
  return (
    body ?? {
      ok: false,
      error: { code: "AI_UNAVAILABLE", message: "Assistant unavailable. Please try again later." },
    }
  );
}

/** Round AI button on every screen, opening the assistant panel (FR-AI-1). */
export function AiAssistant({
  role,
  isAboveTabs = false,
}: {
  role: Role;
  /** The technician screens have a bottom tab bar; keep the button clear of it. */
  isAboveTabs?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || isAsking) return;
    const asked: Message = { id: nextId.current++, role: "user", content: question };
    const history = messages;
    setMessages((current) => [...current, asked]);
    setDraft("");
    setIsAsking(true);
    const result = await ask(question, history);
    setIsAsking(false);
    if (result.ok) {
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          content: result.data.answer,
          sources: result.data.sources,
        },
      ]);
      return;
    }
    setMessages((current) => [
      ...current.map((entry) => (entry.id === asked.id ? { ...entry, isExcluded: true } : entry)),
      {
        id: nextId.current++,
        role: "assistant",
        content: result.error.message,
        isError: true,
        isExcluded: true,
      },
    ]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <>
      {isOpen && (
        <section
          role="dialog"
          aria-label="AI assistant"
          onKeyDown={(event) => event.key === "Escape" && setIsOpen(false)}
          className={`fixed right-4 ${isAboveTabs ? "bottom-40" : "bottom-24"} z-40 flex max-h-[min(36rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-2xl border bg-card shadow-xl`}
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-base font-semibold">Ask about your operations</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="rounded-full"
            >
              Close
            </Button>
          </header>
          <div
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 text-sm"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground">Answers come only from your jobs data. Try:</p>
                {EXAMPLES[role].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => void send(example)}
                    className="rounded-xl border px-3 py-2 text-left hover:bg-muted"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "self-end rounded-2xl bg-ink px-3 py-2 text-sand"
                    : `self-start rounded-2xl px-3 py-2 ${message.isError ? "bg-flag-high-soft text-foreground" : "bg-muted"}`
                }
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Based on: {sourcesLine(message.sources)}
                  </p>
                )}
              </div>
            ))}
            {isAsking && <p className="text-muted-foreground">Checking the data…</p>}
            <div ref={endRef} />
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
            <label htmlFor="ai-question" className="sr-only">
              Your question
            </label>
            <input
              ref={inputRef}
              id="ai-question"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_CONTENT}
              placeholder="Ask about jobs, technicians, flags…"
              className="h-10 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button
              type="submit"
              disabled={isAsking || !draft.trim()}
              className="h-10 rounded-full"
            >
              Ask
            </Button>
          </form>
        </section>
      )}
      <button
        type="button"
        aria-label={isOpen ? "Close AI assistant" : "Ask AI"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`fixed right-4 ${isAboveTabs ? "bottom-20" : "bottom-4"} z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:brightness-110 focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none`}
      >
        <SparkleIcon />
      </button>
    </>
  );
}

function SparkleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="currentColor">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm7 12l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8L2.5 17.5l1.8-.7L5 15z" />
    </svg>
  );
}
