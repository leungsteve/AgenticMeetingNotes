import { elasticService } from "../elastic-instance.js";

export async function runAlertsWorker(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[alerts-worker] Starting run at ${new Date().toISOString()}`);

  await checkOverdueActionItems();
  await checkStaleAccounts();
  await checkAtRiskAccounts();

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
