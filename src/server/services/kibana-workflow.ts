/**
 * DealPulse — programmatic Elastic Workflow execution.
 *
 * Trigger type: manual — invoked after note ingest so Kibana Workflows
 * can orchestrate downstream steps (rollup refresh, agent drafting, alerts).
 *
 * API: POST {KIBANA_URL}/api/workflows/workflow/{id}/run
 * Docs: https://www.elastic.co/docs/api/doc/serverless/operation/operation-post-workflows-workflow-id-run
 *
 * Required env:
 *   KIBANA_URL             — Serverless Kibana base (e.g. https://…kb.…elastic.cloud)
 *   KIBANA_WORKFLOW_ID     — Workflow ID from the Kibana Workflows UI (optional; skip if unset)
 *   KIBANA_API_KEY         — optional; falls back to ELASTIC_API_KEY on Serverless
 */

export interface WorkflowRunInputs {
  note_id: string;
  account?: string | null;
  opportunity_id?: string | null;
  ingested_by?: string;
  [key: string]: unknown;
}

export interface WorkflowRunResult {
  execution_id?: string;
  status?: string;
  skipped?: boolean;
  error?: string;
}

export async function runWorkflowAfterIngest(inputs: WorkflowRunInputs): Promise<WorkflowRunResult> {
  const kibanaUrl = process.env.KIBANA_URL?.replace(/\/+$/, "");
  const workflowId = process.env.KIBANA_WORKFLOW_ID?.trim();
  if (!kibanaUrl || !workflowId) {
    return { skipped: true };
  }

  const apiKey =
    (process.env.KIBANA_API_KEY?.trim() || process.env.ELASTIC_API_KEY?.trim()) ?? "";
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn("[kibana-workflow] No API key for Workflow execution — skipping");
    return { skipped: true };
  }

  const url = `${kibanaUrl}/api/workflows/workflow/${encodeURIComponent(workflowId)}/run`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `ApiKey ${apiKey}`,
        "kbn-xsrf": "true",
      },
      body: JSON.stringify({ inputs }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[kibana-workflow] Run returned ${res.status}: ${text}`);
      return { error: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as { workflowExecutionId?: string; executionId?: string; id?: string; status?: string };
    const execution_id = json.workflowExecutionId ?? json.executionId ?? json.id;
    // eslint-disable-next-line no-console
    console.log(`[kibana-workflow] Workflow ${workflowId} started, execution=${execution_id}`);
    return { execution_id, status: json.status ?? "started" };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[kibana-workflow] Execution failed:", e instanceof Error ? e.message : e);
    return { error: e instanceof Error ? e.message : "unknown" };
  }
}
