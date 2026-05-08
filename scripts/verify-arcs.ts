/**
 * Ad-hoc arc verification — sanity-checks that the demo notes hit the
 * dashboards and agent surfaces correctly. Safe to delete after demo prep.
 */
import "dotenv/config";
import { createElasticsearchClientFromEnv } from "../src/server/config/elastic-client.js";

const c = createElasticsearchClientFromEnv();

interface Bucket {
  key: string;
  doc_count: number;
}
interface Hit<S = Record<string, unknown>> {
  _source: S;
}

console.log("\n=== Author distribution (Beat 1 cross-author filter test) ===");
const byRole = (await c.search({
  index: "granola-meeting-notes",
  size: 0,
  query: { prefix: { meeting_group_id: "demo-" } },
  aggs: { roles: { terms: { field: "author_role", size: 10 } } },
} as never)) as { aggregations: { roles: { buckets: Bucket[] } } };
for (const b of byRole.aggregations.roles.buckets) {
  console.log(`  ${b.key.padEnd(8)} ${b.doc_count} notes`);
}

console.log("\n=== AE-authored notes (Beat 1 author=AE filter) ===");
const aeNotes = (await c.search({
  index: "granola-meeting-notes",
  size: 10,
  query: {
    bool: {
      filter: [
        { term: { author_role: "AE" } },
        { prefix: { meeting_group_id: "demo-" } },
      ],
    },
  },
  _source: ["account", "title", "author_name"],
  sort: [{ meeting_date: { order: "desc" } }],
} as never)) as { hits: { hits: Hit<{ account: string; title: string; author_name: string }>[] } };
for (const h of aeNotes.hits.hits) {
  console.log(
    `  ${h._source.account.padEnd(28)} ${h._source.author_name.padEnd(14)} ${h._source.title}`,
  );
}

console.log("\n=== 'splunk-replacement' tagged notes (Beat 6 cross-account thread) ===");
const splunk = (await c.search({
  index: "granola-meeting-notes",
  size: 30,
  query: { term: { tags: "splunk-replacement" } },
  _source: ["account", "title", "tech_status"],
  sort: [{ meeting_date: { order: "desc" } }],
} as never)) as {
  hits: { total: { value: number }; hits: Hit<{ account: string; title: string; tech_status: string }>[] };
};
const splunkAccounts = new Set(splunk.hits.hits.map((h) => h._source.account));
console.log(`  total: ${splunk.hits.total.value} notes across ${splunkAccounts.size} accounts`);
for (const h of splunk.hits.hits.slice(0, 10)) {
  console.log(
    `  [${(h._source.tech_status || "-").padEnd(6)}] ${h._source.account.padEnd(28)} ${h._source.title}`,
  );
}

console.log("\n=== 'datadog-replacement' tagged notes ===");
const dd = (await c.search({
  index: "granola-meeting-notes",
  size: 20,
  query: { term: { tags: "datadog-replacement" } },
  _source: ["account", "title", "tech_status"],
  sort: [{ meeting_date: { order: "desc" } }],
} as never)) as {
  hits: { total: { value: number }; hits: Hit<{ account: string; title: string; tech_status: string }>[] };
};
const ddAccounts = new Set(dd.hits.hits.map((h) => h._source.account));
console.log(`  total: ${dd.hits.total.value} notes across ${ddAccounts.size} accounts`);
for (const h of dd.hits.hits) {
  console.log(
    `  [${(h._source.tech_status || "-").padEnd(6)}] ${h._source.account.padEnd(28)} ${h._source.title}`,
  );
}

console.log("\n=== 'help_needed' (VP Asks of Leadership panel) ===");
const helps = (await c.search({
  index: "opportunity-rollups",
  size: 20,
  query: { exists: { field: "help_needed" } },
  _source: ["account", "opp_id", "tech_status", "help_needed"],
} as never)) as {
  hits: { hits: Hit<{ account: string; opp_id: string; tech_status: string; help_needed: string }>[] };
};
console.log(`  total: ${helps.hits.hits.length} opps with active help_needed`);
for (const h of helps.hits.hits) {
  const txt = (h._source.help_needed || "").slice(0, 100);
  console.log(`  [${(h._source.tech_status || "-").padEnd(6)}] ${h._source.account.padEnd(24)} ${txt}`);
}

console.log("\n=== Latest 'what_changed' (Risk Tracker headline) ===");
const opps = (await c.search({
  index: "opportunity-rollups",
  size: 12,
  sort: [{ acv: { order: "desc" } }],
  _source: ["opp_id", "tech_status", "what_changed"],
} as never)) as {
  hits: { hits: Hit<{ opp_id: string; tech_status: string; what_changed: string }>[] };
};
for (const h of opps.hits.hits) {
  const wc = (h._source.what_changed || "(none)").slice(0, 90);
  console.log(`  ${h._source.opp_id.padEnd(28)} [${(h._source.tech_status || "-").padEnd(6)}] ${wc}`);
}

console.log("\n=== MEDDPICC completeness scores (Beat 3b) ===");
const medp = (await c.search({
  index: "opportunity-rollups",
  size: 12,
  sort: [{ acv: { order: "desc" } }],
  _source: ["opp_id", "medpicc"],
} as never)) as {
  hits: {
    hits: Hit<{
      opp_id: string;
      medpicc?: {
        completeness_score?: number;
        metrics?: { covered: boolean };
        economic_buyer?: { covered: boolean };
        decision_criteria?: { covered: boolean };
        decision_process?: { covered: boolean };
        paper_process?: { covered: boolean };
        identify_pain?: { covered: boolean };
        champion?: { covered: boolean };
        competition?: { covered: boolean };
      };
    }>[];
  };
};
for (const h of medp.hits.hits) {
  const m = h._source.medpicc;
  const score = m?.completeness_score ?? 0;
  const flags = [
    m?.metrics?.covered ? "M" : ".",
    m?.economic_buyer?.covered ? "E" : ".",
    m?.decision_criteria?.covered ? "D" : ".",
    m?.decision_process?.covered ? "D" : ".",
    m?.paper_process?.covered ? "P" : ".",
    m?.identify_pain?.covered ? "I" : ".",
    m?.champion?.covered ? "C" : ".",
    m?.competition?.covered ? "C" : ".",
  ].join("");
  console.log(`  ${h._source.opp_id.padEnd(28)} ${score}/8  [${flags}]`);
}

console.log("\n=== Hygiene: stalest opps (Manager Hygiene Leaderboard) ===");
const stale = (await c.search({
  index: "opportunity-rollups",
  size: 5,
  sort: [{ last_meeting_date: { order: "asc" } }],
  _source: ["opp_id", "owner_se_email", "last_meeting_date"],
} as never)) as {
  hits: { hits: Hit<{ opp_id: string; owner_se_email: string; last_meeting_date: string }>[] };
};
const now = Date.now();
for (const h of stale.hits.hits) {
  const days = h._source.last_meeting_date
    ? Math.round((now - new Date(h._source.last_meeting_date).getTime()) / 86_400_000)
    : -1;
  console.log(
    `  ${h._source.opp_id.padEnd(28)} ${h._source.owner_se_email.padEnd(28)} ${days} days stale`,
  );
}

console.log("\n=== Open action items by owner (Inbox / overdue alerts) ===");
const items = (await c.search({
  index: "action-items",
  size: 0,
  query: { term: { status: "open" } },
  aggs: { by_owner: { terms: { field: "owner", size: 12 } } },
} as never)) as { aggregations: { by_owner: { buckets: Bucket[] } } };
for (const b of items.aggregations.by_owner.buckets) {
  console.log(`  ${b.key.padEnd(40)} ${b.doc_count} open items`);
}
