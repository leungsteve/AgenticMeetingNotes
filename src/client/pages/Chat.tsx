import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../hooks/useSession.js";
import { useSystemStatus } from "../hooks/useSystemStatus.js";
import { postJson } from "../lib/api.js";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const SUGGESTED_PROMPTS = [
  "What's the MEDDPICC status for Aurora Health Systems?",
  "Which deals have incomplete MEDDPICC — missing champion, economic buyer, or decision process?",
  "Give me a 1-2-3 Salesforce update for Aurora Health Systems",
  "Which opportunities are red this week?",
  "What are my open action items?",
];

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
          return <p key={i} className="font-semibold text-slate-900">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith("# ")) return <p key={i} className="text-base font-bold text-slate-900">{line.slice(2)}</p>;
        if (line.startsWith("## ")) return <p key={i} className="text-sm font-bold text-slate-900">{line.slice(3)}</p>;
        if (line.startsWith("### ")) return <p key={i} className="text-sm font-semibold text-slate-800">{line.slice(4)}</p>;
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return <p key={i} className="flex gap-2"><span className="text-slate-400 shrink-0">•</span><span>{renderInline(line.slice(2))}</span></p>;
        }
        const numMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (numMatch) {
          return <p key={i} className="flex gap-2"><span className="shrink-0 text-slate-400">{numMatch[1]}.</span><span>{renderInline(numMatch[2])}</span></p>;
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

export default function Chat() {
  const { status } = useSystemStatus();
  const { user } = useSession();
  const agentReady = status?.agent_builder?.configured;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      setError(null);

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const result = await postJson<{ response: string; conversation_id: string }>(
          "/api/chat",
          { message: trimmed, conversation_id: conversationId },
        );
        setConversationId(result.conversation_id || undefined);
        const assistantMsg: Message = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.response,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [loading, conversationId],
  );

  const startNew = () => {
    setMessages([]);
    setConversationId(undefined);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="grid min-h-[min(80vh,700px)] grid-cols-1 gap-4 md:grid-cols-4">
      {/* Sidebar */}
      <aside className="flex flex-col rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm md:col-span-1">
        <h3 className="text-sm font-semibold text-slate-900">Account Intelligence</h3>
        <button
          type="button"
          onClick={startNew}
          disabled={!agentReady}
          className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + New conversation
        </button>

        {messages.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Current</p>
            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="truncate text-xs text-slate-700">
                {messages[0]?.content.slice(0, 50)}…
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-auto">
          <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${agentReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {agentReady
              ? "Agent Builder connected"
              : "Agent Builder not configured — set AGENT_BUILDER_URL in .env"}
          </div>
          {user ? (
            <p className="mt-2 truncate text-[11px] text-slate-400">{user.email}</p>
          ) : null}
        </div>
      </aside>

      {/* Main chat */}
      <section className="flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-sm md:col-span-3">
        <header className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Account Intelligence Agent</h2>
          <p className="text-xs text-slate-500">
            Powered by Elastic Agent Builder · Searches meeting notes, rollups, and action items
          </p>
        </header>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <div className="mb-4 text-4xl">⚡</div>
              <p className="text-sm font-medium text-slate-700">Ask anything about your accounts</p>
              <p className="mt-1 text-xs text-slate-400">Searches your meeting notes and opportunity data in real time</p>
              {agentReady ? (
                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-sm">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void send(p)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 border border-slate-200 text-slate-800"
                }`}
              >
                {m.role === "assistant" ? (
                  <MarkdownText text={m.content} />
                ) : (
                  <p>{m.content}</p>
                )}
              </div>
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-100 px-6 py-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              disabled={!agentReady || loading}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={agentReady ? "Ask about accounts, deals, action items…" : "Configure Agent Builder to enable chat"}
            />
            <button
              type="button"
              disabled={!agentReady || loading || !input.trim()}
              onClick={() => void send(input)}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Enter to send · Agent Builder agent: account-intelligence-agent
          </p>
        </div>
      </section>
    </div>
  );
}
