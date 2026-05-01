import { useEffect, useRef, useState } from "react";
import { useSystemStatus } from "../hooks/useSystemStatus.js";
import type { AgentPersona } from "../types/index.js";

const PERSONAS: { id: AgentPersona; label: string; hint: string; group: string }[] = [
  { id: "sa", label: "SA", hint: "Solutions Architect — pre-sales advisor", group: "SA org" },
  {
    id: "se",
    label: "SA (weekly OS)",
    hint: "SA running the weekly tech-win loop / 1-2-3",
    group: "SA org",
  },
  { id: "manager", label: "SA Manager", hint: "Ed level — 12 SAs, exception-driven", group: "SA org" },
  { id: "director", label: "SA Director", hint: "3-5 SA Managers; rolls up across teams", group: "SA org" },
  { id: "vp", label: "SA VP", hint: "Kevin level — head of pre-sales", group: "SA org" },
  { id: "ae", label: "AE", hint: "Account Executive", group: "Sales org" },
  { id: "sales_rvp", label: "Sales RVP", hint: "Regional VP — 6-12 AEs", group: "Sales org" },
  { id: "sales_avp", label: "Sales AVP", hint: "Area VP — rolls up across RVPs", group: "Sales org" },
  { id: "ca", label: "CA", hint: "Customer Architect — post-sales", group: "Post-sales" },
];

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
}

interface ChatResponse {
  message: string;
  conversation_id?: string;
  error?: string;
}

export default function Chat() {
  const { status } = useSystemStatus();
  const [persona, setPersona] = useState<AgentPersona>("ae");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const agentReady = status?.agent_builder?.configured;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, persona, conversation_id: conversationId }),
      });
      const data = (await res.json()) as ChatResponse;

      if (!res.ok || data.error) {
        setError(data.error ?? `Server error ${res.status}`);
      } else {
        if (data.conversation_id) setConversationId(data.conversation_id);
        const agentMsg: Message = {
          id: crypto.randomUUID(),
          role: "agent",
          content: data.message,
        };
        setMessages((prev) => [...prev, agentMsg]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function startNew() {
    setMessages([]);
    setConversationId(undefined);
    setError(null);
  }

  return (
    <div className="grid min-h-[min(70vh,640px)] grid-cols-1 gap-4 md:grid-cols-4">
      <aside className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm md:col-span-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Conversations</h3>
        {messages.length > 0 ? (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 truncate">
            {messages[0].content.slice(0, 40)}…
          </p>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No conversations yet</p>
        )}
        <button
          type="button"
          onClick={startNew}
          disabled={!agentReady}
          className="mt-3 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 disabled:text-slate-400 dark:disabled:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          New Chat
        </button>
        <div className="mt-6">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Persona</p>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            value={persona}
            onChange={(e) => setPersona(e.target.value as AgentPersona)}
          >
            {Array.from(
              PERSONAS.reduce((acc, p) => {
                if (!acc.has(p.group)) acc.set(p.group, []);
                acc.get(p.group)!.push(p);
                return acc;
              }, new Map<string, typeof PERSONAS>()),
            ).map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} — {p.hint}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </aside>

      <section className="flex flex-col rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm md:col-span-3 overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Account Intelligence Agent</h2>
          {!agentReady ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              AGENT_BUILDER_URL is not set on the server — chat stays disabled until it is configured.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Connected · {PERSONAS.find((p) => p.id === persona)?.label} persona
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Ask about accounts, deals, action items, or request a 1-2-3 update.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-2.5">
                <span className="inline-flex gap-1 items-center text-slate-400 dark:text-slate-500 text-sm">
                  <span className="animate-bounce [animation-delay:0ms]">·</span>
                  <span className="animate-bounce [animation-delay:150ms]">·</span>
                  <span className="animate-bounce [animation-delay:300ms]">·</span>
                </span>
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl px-4 py-2.5 text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                {error}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-800 px-6 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!agentReady || loading}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-800/40 disabled:text-slate-400"
              placeholder={agentReady ? "Message the agent… (Enter to send)" : "Configure AGENT_BUILDER_URL to enable chat"}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!agentReady || loading || !input.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
