import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = path.resolve(__dirname, "../../../docs/eval");

interface GoldQuestion {
  id: string;
  persona: string;
  question: string;
  expected_topics: string[];
  expected_sources: string[];
}

interface EvalResult {
  id: string;
  persona: string;
  question: string;
  latency_ms: number;
  tool_calls: string[];
  answer_length: number;
  sources_cited: string[];
  expected_sources: string[];
  source_coverage: number; // fraction of expected_sources present in sources_cited
  status: "ok" | "error";
  error?: string;
}

function loadGoldQuestions(file: string): GoldQuestion[] {
  const fullPath = path.join(EVAL_DIR, file);
  if (!existsSync(fullPath)) return [];
  return readFileSync(fullPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GoldQuestion);
}

export async function runEvalHarness(agentBaseUrl: string, apiKey: string): Promise<void> {
  void agentBaseUrl;
  void apiKey;
  const allQuestions = [
    ...loadGoldQuestions("gold-ae.jsonl"),
    ...loadGoldQuestions("gold-sa-ca.jsonl"),
    ...loadGoldQuestions("gold-leader.jsonl"),
  ];

  if (!allQuestions.length) {
    // eslint-disable-next-line no-console
    console.warn("[eval] No gold questions found.");
    return;
  }

  const results: EvalResult[] = [];

  for (const q of allQuestions) {
    const start = Date.now();
    try {
      // In Phase 2, this will POST to agentBaseUrl and parse SSE
      // For now, simulate with a stub response
      const latency_ms = Date.now() - start;
      results.push({
        id: q.id,
        persona: q.persona,
        question: q.question,
        latency_ms,
        tool_calls: [],
        answer_length: 0,
        sources_cited: [],
        expected_sources: q.expected_sources,
        source_coverage: 0,
        status: "ok",
        error: "Eval harness stub — connect AGENT_BUILDER_URL to run live evals",
      });
    } catch (err) {
      results.push({
        id: q.id,
        persona: q.persona,
        question: q.question,
        latency_ms: Date.now() - start,
        tool_calls: [],
        answer_length: 0,
        sources_cited: [],
        expected_sources: q.expected_sources,
        source_coverage: 0,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Compute metrics
  const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const avgCoverage = results.reduce((s, r) => s + r.source_coverage, 0) / results.length;

  const summary = {
    run_at: new Date().toISOString(),
    total_questions: allQuestions.length,
    latency_p50_ms: p50,
    latency_p95_ms: p95,
    avg_source_coverage: Math.round(avgCoverage * 100) / 100,
    by_persona: Object.fromEntries(
      ["ae", "sa_ca", "leader"].map((persona) => [
        persona,
        results.filter((r) => r.persona === persona).length,
      ]),
    ),
    results,
  };

  if (!existsSync(EVAL_DIR)) mkdirSync(EVAL_DIR, { recursive: true });
  const outFile = path.join(EVAL_DIR, `results-${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(outFile, JSON.stringify(summary, null, 2));
  // eslint-disable-next-line no-console
  console.log(`[eval] Results written to ${outFile}`);
  // eslint-disable-next-line no-console
  console.log(`[eval] p50=${p50}ms p95=${p95}ms coverage=${avgCoverage}`);
}
