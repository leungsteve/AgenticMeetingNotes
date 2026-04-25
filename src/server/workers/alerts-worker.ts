import { elasticService } from "../elastic-instance.js";

const COMMIT_THRESHOLD_ACV = 1_000_000;

export async function runAlertsWorker(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[alerts-worker] Starting run at ${new Date().toISOString()}`);

  await checkOverdueActionItems();
  await checkStaleAccounts();
  await checkAtRiskAccounts();
  await checkOpportunityAtRisk();

  // eslint-disable-next-line no-console
  console.log(`[alerts-worker] Completed at ${new Date().toISOString()}`);
}

async function checkOverdueActionItems(): Promise<void> {
  const overdueItems = await elasticService.listActionItems({ overdue: true, status: "open", size: 200 });
  for (const item of overdueItems) {
    const owner = (item.owner as string) ?? "unknown";
    const account = (item.account as string) ?? "unknown";
    const desc = (item.description as string) ?? "";
    await elasticService.createAlert({
      alert_type: "overdue_action_item",
      account,
      owner,
      severity: "high",
      message: `Overdue action item for ${account}: "${desc.slice(0, 100)}" was due ${item.due_date}.`,
      dedup_key: `overdue_${String(item._id ?? item.source_note_id ?? "unknown")}_${desc.slice(0, 20)}`,
    });
  }
}

async function checkStaleAccounts(): Promise<void> {
  const teams = await elasticService.listPursuitTeams();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const team of teams) {
    const account = team.account as string;
    if (!account) continue;
    const rollup = await elasticService.getAccountRollup(account);
    if (!rollup) continue;

    const lastMeeting = rollup.last_meeting_date as string | undefined;
    if (lastMeeting && lastMeeting < thirtyDaysAgo) {
      const members = (team.members as Array<{ email: string; role: string }> | undefined) ?? [];
      const ae = members.find((m) => m.role === "AE");
      const owner = ae?.email ?? members[0]?.email ?? "unknown";

      await elasticService.createAlert({
        alert_type: "stale_account",
        account,
        owner,
        severity: "medium",
        message: `No meeting recorded for ${account} in 30+ days. Last meeting: ${lastMeeting?.slice(0, 10) ?? "never"}.`,
        dedup_key: `stale_${account}_${thirtyDaysAgo.slice(0, 10)}`,
      });
    }
  }
}

/**
 * Opportunity-level "at-risk" alerts derived from the opportunity-rollups index.
 *
 * Severity model (per plan):
 *   high   when tech_status == red AND (forecast_category == commit OR acv >= 1_000_000)
 *   medium when tech_status == red but the opportunity is neither commit nor large
 *   low    when tech_status == yellow on a commit-stage or large opportunity
 *
 * Dedup key is opp_id + computed_at-day so we get at most one alert per opp per day.
 */
async function checkOpportunityAtRisk(): Promise<void> {
  const rollups = await elasticService.searchOpportunityRollups({ size: 2000 });
  for (const r of rollups) {
    const status = r.tech_status;
    if (status !== "red" && status !== "yellow") continue;

    const forecast = (r.forecast_category ?? "").toLowerCase();
    const acv = typeof r.acv === "number" ? r.acv : 0;
    const isCommit = forecast === "commit";
    const isLarge = acv >= COMMIT_THRESHOLD_ACV;

    let severity: "high" | "medium" | "low";
    if (status === "red" && (isCommit || isLarge)) severity = "high";
    else if (status === "red") severity = "medium";
    else if (status === "yellow" && (isCommit || isLarge)) severity = "low";
    else continue;

    const owner =
      r.owner_se_email ||
      r.owner_ae_email ||
      r.manager_email ||
      "unknown";
    const day = String(r.computed_at ?? new Date().toISOString()).slice(0, 10);
    const acvFmt = acv >= 1_000 ? `$${Math.round(acv / 1000)}k` : `$${acv}`;
    const reason = (r.tech_status_reason ?? "").trim();
    const acctOpp = `${r.account}${r.opp_name ? ` — ${r.opp_name}` : ""}`;

    let message = `${status.toUpperCase()} ${acctOpp} (${acvFmt}, ${forecast || "uncategorized"})`;
    if (reason) message += `: ${reason.slice(0, 180)}`;
    if (severity === "high") {
      message += ` — escalation recommended (${isCommit ? "commit" : ""}${
        isCommit && isLarge ? " + " : ""
      }${isLarge ? "≥ $1M" : ""}).`;
    }

    await elasticService.createAlert({
      alert_type: "opportunity_at_risk",
      account: r.account,
      owner,
      severity,
      message,
      metadata: {
        opp_id: r.opp_id,
        opp_name: r.opp_name,
        tech_status: status,
        forecast_category: r.forecast_category,
        acv: r.acv,
        manager_email: r.manager_email,
        owner_se_email: r.owner_se_email,
        path_to_tech_win: r.path_to_tech_win,
      },
      dedup_key: `opp_at_risk_${r.opp_id}_${day}`,
    });
  }
}

async function checkAtRiskAccounts(): Promise<void> {
  const teams = await elasticService.listPursuitTeams();

  for (const team of teams) {
    const account = team.account as string;
    if (!account) continue;
    const rollup = await elasticService.getAccountRollup(account);
    if (!rollup) continue;

    const sentiment = rollup.latest_sentiment as string | undefined;
    if (sentiment === "skeptical" || sentiment === "concerned") {
      const members = (team.members as Array<{ email: string; role: string }> | undefined) ?? [];
      const ae = members.find((m) => m.role === "AE");
      const owner = ae?.email ?? members[0]?.email ?? "unknown";

      await elasticService.createAlert({
        alert_type: "at_risk_account",
        account,
        owner,
        severity: sentiment === "skeptical" ? "high" : "medium",
        message: `${account} shows ${sentiment} sentiment in latest meeting. Review account health.`,
        dedup_key: `at_risk_${account}_${String(rollup.computed_at ?? "unknown").slice(0, 10)}`,
      });
    }
  }
}
