import { useState } from "react";
import { useSystemStatus } from "../hooks/useSystemStatus.js";
import type { AgentPersona } from "../types/index.js";

const PERSONAS: { id: AgentPersona; label: string }[] = [
  { id: "ae", label: "AE" },
  { id: "sa_ca", label: "SA–CA" },
  { id: "leader", label: "Leader" },
];

export default function Chat() {
  const { status } = useSystemStatus();
  const [persona, setPersona] = useState<AgentPersona>("ae");
  const agentReady = status?.agent_builder?.configured;

  return (
    <div className="grid min-h-[min(70vh,640px)] grid-cols-1 gap-4 md:grid-cols-4">
      <aside className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm md:col-span-1">
        <h3 className="text-sm font-semibold text-slate-900">Conversations</h3>
        <p className="mt-4 text-sm text-slate-500">No conversations yet</p>
        <button
          type="button"
          disabled
          className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
        >
          New Chat
        </button>
        <div className="mt-6">
          <p className="text-xs font-medium text-slate-500">Persona</p>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            value={persona}
            onChange={(e) => setPersona(e.target.value as AgentPersona)}
          >
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </aside>

      <section className="flex flex-col rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm md:col-span-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Account Intelligence Agent</h2>
          <p className="mt-1 text-sm text-slate-600">
            Connect Kibana Agent Builder in Settings to enable chat.
          </p>
          {!agentReady ? (
            <p className="mt-1 text-xs text-slate-500">
              AGENT_BUILDER_URL is not set on the server — chat stays disabled until it is configured.
            </p>
          ) : null}
        </div>

        <div className="mt-auto border-t border-slate-100 pt-4">
          <div className="flex gap-2">
            <input
              type="text"
              disabled
              className="flex-1 cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
              placeholder="Message the agent…"
            />
            <button
              type="button"
              disabled
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
