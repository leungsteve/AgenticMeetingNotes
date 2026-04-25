/**
 * seed-demo-notes
 *
 * Generates a complete, fictitious demo dataset for the Risk Tracker, Manager
 * Dashboard, Friday digest, and agent personas — without needing live Granola
 * or Salesforce data.
 *
 * What it does
 * ------------
 * 1. Reads `data/opportunities.csv` (the same file `seed:opportunities` reads).
 * 2. For each opportunity, instantiates a hand-tuned narrative ("scenario")
 *    that maps to a Tech Status (red / yellow / green) and a forecast story:
 *      - Aurora Health (red commit, $1.85M)   → exec escalation (high severity)
 *      - Helix Robotics platform (red commit) → biggest red, slipping
 *      - Polaris Energy SIEM (red commit)     → POC at risk, high severity
 *      - Meridian Systems (yellow commit)     → tier-1 pricing gap
 *      - Helix Migration / Aurora Obs         → yellow upside follow-ons
 *      - Lattice / Stratum / Nimbus / Polaris AI → green / healthy
 *      - Redwood Logistics                    → stale (no recent meeting)
 * 3. Materializes 1–3 synthetic Granola meeting notes per opportunity with
 *    realistic summary, technical_environment, action_items, commitments,
 *    customer_sentiment, competitive_landscape, demo_poc_request, and the
 *    new tech_win fields (tech_status, path_to_tech_win, next_milestone,
 *    what_changed, help_needed). Note IDs are deterministic so re-runs are
 *    idempotent.
 * 4. Indexes each note via the standard ingest pipeline (so Jina embeddings
 *    are computed) and denormalizes action items into the action-items index
 *    so the existing alerts + rollups workers light up.
 *
 * Customization
 * -------------
 * - To swap account names, edit `data/opportunities.csv` (and the matching
 *   arrays in `scripts/seed-lookups.ts`). All text in this file references
 *   accounts via their CSV row, so a single edit propagates everywhere.
 * - To add or remove opportunities, edit the CSV and add/remove a SCENARIO
 *   block below (or let it fall through to the generic template).
 *
 * All names, contacts, and content below are FICTITIOUS. Never seed real
 * customer information through this script.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { errors } from "@elastic/elasticsearch";
import { ElasticService } from "../src/server/services/elastic.js";
import { denormalizeActionItems } from "../src/server/workers/rollup-worker.js";
import type { IngestNoteInput } from "../src/server/types/ingest-note.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV_PATH = path.resolve(__dirname, "..", "data", "opportunities.csv");

// --- CSV parser (RFC-4180-ish) — same as seed-opportunities ---------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0]?.trim().length) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.length > 1 || row[0]?.trim().length) rows.push(row);
  }
  return rows;
}

interface OppRow {
  opp_id: string;
  account: string;
  account_display: string;
  opp_name: string;
  acv: number;
  close_quarter: string;
  close_date: string;
  forecast_category: string;
  sales_stage: string;
  owner_se_email: string;
  owner_se_name: string;
  owner_ae_email: string;
  owner_ae_name: string;
  manager_email: string;
  tier: string;
  region: string;
  notes: string;
}

function loadOpps(csvPath: string): OppRow[] {
  const raw = readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length < 2) throw new Error(`CSV at ${csvPath} has no data rows`);
  const header = rows[0].map((h) => h.trim());
  const out: OppRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells.length || cells.every((c) => !c?.trim())) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = (cells[c] ?? "").trim();
    }
    out.push({
      opp_id: obj.opp_id,
      account: obj.account,
      account_display: obj.account_display || obj.account,
      opp_name: obj.opp_name,
      acv: Number(obj.acv?.replace(/[$,]/g, "") || 0),
      close_quarter: obj.close_quarter,
      close_date: obj.close_date,
      forecast_category: obj.forecast_category?.toLowerCase(),
      sales_stage: obj.sales_stage?.toLowerCase(),
      owner_se_email: obj.owner_se_email?.toLowerCase(),
      owner_se_name: obj.owner_se_name,
      owner_ae_email: obj.owner_ae_email?.toLowerCase(),
      owner_ae_name: obj.owner_ae_name,
      manager_email: obj.manager_email?.toLowerCase(),
      tier: obj.tier,
      region: obj.region,
      notes: obj.notes,
    });
  }
  return out;
}

// --- Helpers --------------------------------------------------------------

function isoDateAtNoon(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(17, 0, 0, 0); // ~10 AM PT
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

function isoDateOnly(daysOffset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function noteId(oppId: string, slug: string): string {
  return createHash("sha256").update(`demo:${oppId}:${slug}`).digest("hex").slice(0, 24);
}

function customerEmail(name: string, accountSlug: string): string {
  const local = name.toLowerCase().replace(/[^a-z]/g, ".");
  return `${local}@${accountSlug}.example`;
}

function accountSlug(account: string): string {
  return account.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// --- Scenario shapes ------------------------------------------------------

interface DemoCustomerContact {
  name: string;
  title: string;
  role_flag?: "decision_maker" | "champion" | "technical_evaluator" | "blocker";
}

interface DemoActionItem {
  description: string;
  owner: string; // email
  due_offset_days: number; // negative = overdue
  status?: "open" | "in_progress" | "complete";
}

interface DemoNoteSpec {
  daysAgo: number;
  meeting_type: "discovery" | "demo" | "technical-review" | "poc" | "qbr" | "internal";
  title: string;
  summary: string;
  key_topics: string;
  decisions_made: string;
  open_questions: string;
  customers: DemoCustomerContact[];
  technical_environment: {
    current_stack: string;
    pain_points: string;
    requirements: string;
    integrations?: string;
    constraints?: string;
    scale?: string;
  };
  action_items: DemoActionItem[];
  commitments?: Array<{ description: string; committed_by: string; timeline: string }>;
  customer_sentiment: {
    overall: "positive" | "neutral" | "negative" | "concerned";
    concerns?: string;
    objections?: string;
    champion_signals?: string;
  };
  competitive_landscape?: {
    incumbent?: string;
    competitors_evaluating?: string[];
    mentions?: string;
    differentiators?: string;
  };
  budget_timeline?: {
    budget?: string;
    timeline?: string;
    procurement?: string;
    stage_signals?: string;
  };
  demo_poc_request?: {
    description?: string;
    requirements?: string;
    data_available?: string;
    timeline?: string;
    success_criteria?: string;
    audience?: string;
  };
  next_meeting?: { offset_days: number; agenda: string };
  tags: string[];
  // Tech-Win fields
  tech_status: "red" | "yellow" | "green";
  tech_status_reason: string;
  path_to_tech_win: string;
  next_milestone: { offset_days: number; description: string };
  what_changed: string;
  help_needed?: string;
}

function buildNote(opp: OppRow, spec: DemoNoteSpec): IngestNoteInput {
  const slug = `${spec.meeting_type}-${spec.daysAgo}`;
  const id = noteId(opp.opp_id, slug);
  const acctSlug = accountSlug(opp.account);
  const attendees: IngestNoteInput["attendees"] = [
    {
      name: opp.owner_se_name,
      title: "Solutions Architect",
      company: "Elastic",
      email: opp.owner_se_email,
      role_flag: "internal",
    },
    {
      name: opp.owner_ae_name,
      title: "Account Executive",
      company: "Elastic",
      email: opp.owner_ae_email,
      role_flag: "internal",
    },
    ...spec.customers.map((c) => ({
      name: c.name,
      title: c.title,
      company: opp.account_display,
      email: customerEmail(c.name, acctSlug),
      role_flag: c.role_flag,
    })),
  ];
  return {
    note_id: id,
    meeting_group_id: `demo-${opp.opp_id.toLowerCase()}-${spec.meeting_type}`,
    account: opp.account,
    opportunity: opp.opp_id,
    opportunity_id: opp.opp_id,
    team: opp.region,
    author_email: opp.owner_se_email,
    author_name: opp.owner_se_name,
    author_role: "SA",
    attendees,
    meeting_date: isoDateAtNoon(spec.daysAgo),
    ingested_by: opp.owner_se_email,
    meeting_purpose: spec.meeting_type,
    title: spec.title,
    summary: spec.summary,
    transcript: `[Demo seed] Synthetic transcript placeholder for ${opp.opp_name}. ${spec.summary}`,
    key_topics: spec.key_topics,
    decisions_made: spec.decisions_made,
    open_questions: spec.open_questions,
    technical_environment: {
      current_stack: spec.technical_environment.current_stack,
      pain_points: spec.technical_environment.pain_points,
      requirements: spec.technical_environment.requirements,
      integrations: spec.technical_environment.integrations,
      constraints: spec.technical_environment.constraints,
      scale: spec.technical_environment.scale,
    },
    action_items: spec.action_items.map((a) => ({
      description: a.description,
      owner: a.owner,
      due_date: isoDateOnly(a.due_offset_days),
      status: a.status ?? "open",
    })),
    commitments: spec.commitments,
    customer_sentiment: spec.customer_sentiment,
    competitive_landscape: spec.competitive_landscape,
    budget_timeline: spec.budget_timeline,
    demo_poc_request: spec.demo_poc_request,
    next_meeting: spec.next_meeting
      ? { date: isoDateOnly(spec.next_meeting.offset_days), agenda: spec.next_meeting.agenda }
      : undefined,
    tags: spec.tags,
    meeting_type: spec.meeting_type,
    sales_stage: opp.sales_stage,
    tech_status: spec.tech_status,
    tech_status_reason: spec.tech_status_reason,
    path_to_tech_win: spec.path_to_tech_win,
    next_milestone: {
      date: isoDateOnly(spec.next_milestone.offset_days),
      description: spec.next_milestone.description,
    },
    what_changed: spec.what_changed,
    help_needed: spec.help_needed,
  };
}

// --- Per-opportunity scenarios -------------------------------------------

const SCENARIOS: Record<string, DemoNoteSpec[]> = {
  // -------- Aurora Health (RED commit, $1.85M) — exec escalation --------
  "AURORA-SEC-2026Q2": [
    {
      daysAgo: 28,
      meeting_type: "discovery",
      title: "Aurora Security Analytics — Discovery & Architecture Workshop",
      summary:
        "Reviewed current Splunk + Phantom footprint, the team's pain with index lifecycle costs, and the must-have set for replacement: SAML SSO with their internal IdP, FedRAMP-aligned deployment, and on-prem (private region) ingest. Stacy (Director, SecOps) confirmed Elastic is the preferred path if those three boxes can be checked. Nothing about the data model concerns them — the platform conversation is the gate.",
      key_topics: "siem-replacement, saml, on-prem, fedramp, splunk",
      decisions_made:
        "Aurora will run a head-to-head detection-content evaluation against incumbent in Q2. Elastic is the named alternative.",
      open_questions:
        "1) Can Elastic Cloud Serverless meet the FedRAMP-aligned deployment story for their commercial workloads in 2026? 2) Confirm SAML SSO with their internal IdP via SCIM. 3) Do we have an on-prem deployment exception process for high-sensitivity tenants?",
      customers: [
        { name: "Stacy Reyes", title: "Director, SecOps", role_flag: "decision_maker" },
        { name: "Bryan Cole", title: "Sr Detection Engineer", role_flag: "champion" },
        { name: "Lena Park", title: "Security Architect", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack:
          "Splunk Enterprise 9.x, Splunk Phantom (SOAR), 14 ingest clusters, ~110 detection content packs, ServiceNow ITSM downstream",
        pain_points:
          "Splunk index lifecycle costs growing 30% YoY; Phantom playbook maintenance burden; long detection-tuning cycles",
        requirements:
          "SAML SSO with internal IdP, on-prem ingest for high-sensitivity tenants, FedRAMP-aligned commercial deployment, MITRE ATT&CK coverage parity, ServiceNow incident push",
        integrations: "Internal IdP via SAML/SCIM, ServiceNow, PagerDuty, Slack, Crowdstrike",
        constraints: "Cannot send PHI through public-cloud control plane; must keep ingest in private region.",
        scale: "~24 TB/day ingest, 120 detection rules, 60 SOC analysts",
      },
      action_items: [
        {
          description: "Send draft FedRAMP-aligned deployment story document",
          owner: "steve.leung@elastic.co",
          due_offset_days: -3,
          status: "open",
        },
        {
          description: "Confirm SCIM provisioning compatibility with their IdP version",
          owner: "steve.leung@elastic.co",
          due_offset_days: -10,
          status: "open",
        },
      ],
      commitments: [
        {
          description: "Provide a written exception process for the on-prem ingest case by April 30",
          committed_by: "steve.leung@elastic.co",
          timeline: "by April 30",
        },
      ],
      customer_sentiment: {
        overall: "concerned",
        concerns:
          "Stacy is signaling that without a written FedRAMP-aligned story she cannot defend Elastic in the steering review.",
        objections:
          "Procurement is anchored on Splunk renewal pricing; will not approve net-new spend without the on-prem exception",
        champion_signals: "Bryan is actively championing internally and has set up the eval workspace",
      },
      competitive_landscape: {
        incumbent: "Splunk",
        competitors_evaluating: ["Splunk", "Sumo Logic", "Microsoft Sentinel"],
        mentions: "Sentinel mentioned for the broader Microsoft estate; Sumo briefly evaluated last year",
        differentiators: "Detection-content portability, ESQL, hybrid storage costs",
      },
      budget_timeline: {
        budget: "$1.85M ACV approved if exception clears",
        timeline: "Steering review May 12; close target end of June",
        procurement: "MSA in place; SOW pending",
        stage_signals: "negotiation; tech-win blocked",
      },
      next_meeting: { offset_days: 6, agenda: "Walk through the FedRAMP-aligned deployment story document" },
      tags: ["security", "competitive", "escalation", "has-objections", "has-commitments"],
      tech_status: "red",
      tech_status_reason:
        "FedRAMP-aligned deployment story not yet written; SAML/SCIM compatibility unconfirmed; on-prem exception process not approved.",
      path_to_tech_win:
        "1) Land FedRAMP-aligned deployment doc and walk Stacy through it. 2) Confirm SCIM with their IdP. 3) Get exec approval on the on-prem ingest exception. 4) Run a 60-day side-by-side detection content eval against Splunk.",
      next_milestone: { offset_days: 6, description: "Steering committee readout of FedRAMP doc" },
      what_changed:
        "Status flipped to red after Friday's exec sync — Stacy escalated that without the written FedRAMP story she will recommend renewing Splunk for another year. Procurement now driving the timeline.",
      help_needed:
        "Need product to confirm FedRAMP-aligned 2026 commercial roadmap in writing; need exec sponsor to attend the May 12 steering review.",
    },
    {
      daysAgo: 14,
      meeting_type: "technical-review",
      title: "Aurora Security — SAML / SCIM Compatibility Review",
      summary:
        "Walked through SAML and SCIM provisioning with Lena and her IdP team. Identified one gap: their IdP version emits a non-standard NameID format that we will need to map. Detection-content portability discussion landed well — Bryan confirmed 70% of their existing Splunk SPL maps cleanly to ESQL using our migration tooling.",
      key_topics: "saml, scim, idp, esql, migration",
      decisions_made:
        "We will publish a tested config recipe for their IdP version. Bryan will load the top-30 detection rules into our sandbox by April 22.",
      open_questions: "Is the NameID mapping configurable in our SAML provider, or does it require a feature ticket?",
      customers: [
        { name: "Lena Park", title: "Security Architect", role_flag: "technical_evaluator" },
        { name: "Bryan Cole", title: "Sr Detection Engineer", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack: "Splunk Enterprise 9.x, internal IdP, Crowdstrike EDR, ServiceNow",
        pain_points: "Detection-content authoring slow; SOC analyst onboarding burden",
        requirements: "Documented SAML config matching their IdP's NameID format",
        integrations: "Internal IdP via SAML/SCIM",
      },
      action_items: [
        {
          description: "Publish tested SAML/SCIM config recipe for their IdP version",
          owner: "steve.leung@elastic.co",
          due_offset_days: 5,
          status: "open",
        },
        {
          description: "Help Bryan load top-30 detection rules into the sandbox",
          owner: "steve.leung@elastic.co",
          due_offset_days: 7,
          status: "open",
        },
      ],
      customer_sentiment: {
        overall: "neutral",
        concerns: "NameID mapping wrinkle adds risk to the May 12 readout",
        champion_signals: "Bryan very engaged; loading rules personally",
      },
      next_meeting: { offset_days: 8, agenda: "Validate the published SAML recipe end-to-end" },
      tags: ["security", "technical", "follow-up-scheduled"],
      tech_status: "red",
      tech_status_reason:
        "FedRAMP doc still not delivered; SAML SSO has a confirmed IdP-version mapping gap that needs a config recipe; detection migration is on track but not yet demonstrated.",
      path_to_tech_win:
        "Same as last week + close out the SAML NameID mapping with a published config recipe before the May 12 readout.",
      next_milestone: { offset_days: 8, description: "End-to-end SAML validation in their sandbox" },
      what_changed:
        "Detection-content portability proven (70% maps cleanly). New blocker surfaced: SAML NameID mapping needs a recipe. Tech win still red overall — FedRAMP doc remains the critical-path blocker.",
      help_needed:
        "Need confirmation on whether NameID mapping requires a feature ticket. Still waiting on FedRAMP-aligned 2026 roadmap confirmation from product.",
    },
    {
      daysAgo: 4,
      meeting_type: "internal",
      title: "Aurora Security — Internal Pursuit Sync",
      summary:
        "Pursuit team alignment ahead of the May 12 steering review. Decision: we drive the FedRAMP doc to closure this week and pre-brief Stacy 1:1 before the steering. Marcus to engage product directly on the on-prem exception.",
      key_topics: "pursuit-strategy, escalation, fedramp",
      decisions_made:
        "Pre-brief Stacy on May 8 (1:1). Marcus owns the product/exec conversation on the on-prem exception.",
      open_questions: "Do we have an exec sponsor available for the May 12 steering?",
      customers: [],
      technical_environment: {
        current_stack: "n/a (internal)",
        pain_points: "n/a (internal)",
        requirements: "Exec sponsor for May 12 readout",
      },
      action_items: [
        {
          description: "Pre-brief Stacy on FedRAMP story",
          owner: "steve.leung@elastic.co",
          due_offset_days: 3,
          status: "open",
        },
        {
          description: "Engage product on on-prem ingest exception",
          owner: "priya.shah@elastic.co",
          due_offset_days: 5,
          status: "open",
        },
        {
          description: "Identify and confirm exec sponsor for May 12 steering",
          owner: "ed.salazar@elastic.co",
          due_offset_days: 4,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "neutral" },
      next_meeting: { offset_days: 6, agenda: "Steering review prep" },
      tags: ["escalation", "internal", "action-required"],
      tech_status: "red",
      tech_status_reason:
        "Multiple gates open with two weeks to steering. Without the FedRAMP doc landing this week the deal will likely slip to Q3.",
      path_to_tech_win:
        "Same as last week. Critical path: FedRAMP doc → 1:1 pre-brief → SAML recipe validation → steering readout with exec sponsor.",
      next_milestone: { offset_days: 6, description: "May 12 steering review with exec sponsor present" },
      what_changed:
        "Pursuit team aligned on critical path. Marcus now owns product/exec engagement. Still red — same blockers, now with a tighter timeline.",
      help_needed: "Need an exec sponsor confirmed for the May 12 steering review.",
    },
  ],

  // -------- Aurora Health observability (yellow upside, $420K) ----------
  "AURORA-OBS-2026Q3": [
    {
      daysAgo: 21,
      meeting_type: "discovery",
      title: "Aurora Observability — POC Scoping Discovery",
      summary:
        "Met with the platform-engineering team to scope a Q3 observability POC. Strong alignment on the Datadog cost story; clear interest in our metrics+logs+APM unification. POC is scoped but contingent on the security expansion landing — the platform team won't fund a parallel motion if security stalls.",
      key_topics: "observability-poc, datadog-replacement, apm",
      decisions_made: "Scope a 6-week POC starting in early Q3; contingent on security deal closing.",
      open_questions: "Will product approve free-tier APM agents during the POC window?",
      customers: [
        { name: "Marco Halloran", title: "Sr Platform Engineering Manager", role_flag: "decision_maker" },
        { name: "Yuki Tanaka", title: "Observability Lead", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack: "Datadog (logs + APM + metrics), Prometheus on-cluster, Grafana for SRE dashboards",
        pain_points: "Datadog spend trending 40% YoY; tag-cardinality limits forcing aggregation",
        requirements: "Unified search, OTEL native, multi-tenant cost visibility",
        integrations: "OTEL collector, kube-state-metrics, ServiceNow",
        scale: "~8 TB/day logs, 6M metrics/min, 240 services with APM",
      },
      action_items: [
        {
          description: "Send proposed POC scope document",
          owner: "steve.leung@elastic.co",
          due_offset_days: 5,
          status: "open",
        },
      ],
      customer_sentiment: {
        overall: "positive",
        champion_signals: "Yuki has already evaluated us in a side project at her previous employer",
      },
      competitive_landscape: {
        incumbent: "Datadog",
        competitors_evaluating: ["Datadog", "Grafana Cloud"],
      },
      demo_poc_request: {
        description: "6-week observability POC across 4 representative services",
        requirements: "OTEL ingest, log + APM + metric correlation, cost-per-tenant dashboard",
        success_criteria: "Demonstrate ≥30% cost reduction at parity feature coverage",
        timeline: "Start early Q3, exit by mid-September",
        audience: "Marco's platform-engineering leadership team",
      },
      next_meeting: { offset_days: 14, agenda: "Walk through proposed POC scope" },
      tags: ["demo-request", "competitive"],
      tech_status: "yellow",
      tech_status_reason:
        "Platform team is bought in but funding is contingent on security expansion closing. Tech eval has not started.",
      path_to_tech_win:
        "1) Land security expansion. 2) Kick off POC in early Q3. 3) Hit ≥30% cost reduction at parity. 4) Convert POC to production rollout in Q4.",
      next_milestone: { offset_days: 14, description: "POC scope walk-through with Marco" },
      what_changed: "POC officially scoped; AE has it in the forecast as upside for Q3.",
    },
  ],

  // -------- Helix Robotics platform consolidation (RED commit, $2.4M) ----
  "HELIX-PLAT-2026Q1": [
    {
      daysAgo: 35,
      meeting_type: "discovery",
      title: "Helix Platform Consolidation — Executive Discovery",
      summary:
        "Met with Karen (CIO) and Diego (VP Infrastructure). Helix is consolidating three observability and three search workloads onto one platform. We are the primary candidate; ServiceNow Cloud Observability is the secondary. Karen is pushing for a Q1 close to fold the spend into the FY26 budget. Diego raised concerns about a 12-week migration plan being too aggressive.",
      key_topics: "consolidation, observability, search, migration, executive",
      decisions_made: "Elastic moves into the technical evaluation as the primary; ServiceNow stays as the backup.",
      open_questions: "Can we deliver a credible 12-week migration plan that Diego will sign off on?",
      customers: [
        { name: "Karen Whitfield", title: "CIO", role_flag: "decision_maker" },
        { name: "Diego Marin", title: "VP Infrastructure", role_flag: "blocker" },
        { name: "Aria Chen", title: "Director Platform Engineering", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack:
          "Splunk Observability + Splunk Enterprise (search), Sumo for one BU, internal Lucene for product search",
        pain_points: "6 vendors, 3 contracts, no unified search across robotic-fleet telemetry",
        requirements: "Unified observability + search for fleet telemetry; SLA on dashboard load times",
        integrations: "OTEL, Kafka, Snowflake, internal robotic-fleet telemetry",
        scale: "~38 TB/day across all workloads",
      },
      action_items: [
        {
          description: "Draft the 12-week consolidation migration plan",
          owner: "jordan.kim@elastic.co",
          due_offset_days: -8,
          status: "open",
        },
        {
          description: "Send Splunk-to-Elastic migration estimator",
          owner: "jordan.kim@elastic.co",
          due_offset_days: -2,
          status: "open",
        },
      ],
      customer_sentiment: {
        overall: "neutral",
        concerns: "Diego: timeline. Karen: cost.",
        champion_signals: "Aria openly advocating for Elastic in the steering committee",
      },
      competitive_landscape: {
        incumbent: "Splunk + Sumo + internal Lucene",
        competitors_evaluating: ["ServiceNow Cloud Observability", "Splunk"],
        differentiators: "Single platform for obs + search, ESQL, lower TCO at scale",
      },
      budget_timeline: {
        budget: "$2.4M ACV approved",
        timeline: "Q1 close, FY26 budget cycle",
        procurement: "MSA exists, SOW in flight",
        stage_signals: "negotiation; commit",
      },
      next_meeting: { offset_days: 7, agenda: "Migration plan walkthrough" },
      tags: ["competitive", "migration", "escalation", "has-objections"],
      tech_status: "red",
      tech_status_reason:
        "12-week migration plan is overdue and Diego has not yet bought in. Without his sign-off, the deal will not close in Q1.",
      path_to_tech_win:
        "1) Deliver a defensible 12-week migration plan Diego will sign. 2) Show migration estimator output. 3) Get Aria to drive a steering committee endorsement. 4) Pre-stage the Phase-1 ingest in our sandbox so we can demo on demand.",
      next_milestone: { offset_days: 7, description: "Migration plan walk-through with Diego + Karen" },
      what_changed:
        "Diego raised the timeline concern explicitly. Migration plan now overdue. Forecast at risk for Q1 — slipping is the most likely outcome unless plan lands this week.",
      help_needed: "Need PS scoping help to make the 12-week plan credible. Need exec sponsor on the next call.",
    },
    {
      daysAgo: 18,
      meeting_type: "technical-review",
      title: "Helix Platform — Migration Estimator + Phase-1 Walkthrough",
      summary:
        "Walked Aria through the migration estimator output. Phase-1 ingest scope agreed (the robotic-fleet telemetry stream). Diego sat in for the second half — softened on timeline once he saw the phased breakdown but is still skeptical of the 12-week target.",
      key_topics: "migration-estimator, phase-1, robotic-fleet, kafka",
      decisions_made: "Phase-1 will cover robotic-fleet telemetry only; remaining workloads phased through Q2.",
      open_questions: "Will Diego accept a 14-week plan with a Q1 contract close and Q2 phased migration?",
      customers: [
        { name: "Aria Chen", title: "Director Platform Engineering", role_flag: "champion" },
        { name: "Diego Marin", title: "VP Infrastructure", role_flag: "blocker" },
      ],
      technical_environment: {
        current_stack: "Splunk Observability for fleet telemetry; OTEL collector deployed",
        pain_points: "Dashboard load times >8s; analyst churn",
        requirements: "Sub-2s dashboard load on the fleet-telemetry workload",
        integrations: "Kafka source, OTEL collector, Snowflake sink",
        scale: "12 TB/day for Phase-1 only",
      },
      action_items: [
        {
          description: "Revise migration plan to 14 weeks with Q2 phased rollout",
          owner: "jordan.kim@elastic.co",
          due_offset_days: 3,
          status: "open",
        },
      ],
      customer_sentiment: {
        overall: "neutral",
        concerns: "Diego still anchored on a 16-week safety margin",
        champion_signals: "Aria asked for our PS partner contacts directly",
      },
      next_meeting: { offset_days: 5, agenda: "Walk Diego through revised 14-week plan" },
      tags: ["migration", "technical", "competitive"],
      tech_status: "red",
      tech_status_reason:
        "Diego has softened but is not yet committed to the timeline. Tech win is gated on his sign-off.",
      path_to_tech_win:
        "Land the revised 14-week plan with Diego this week, then schedule a steering review with Karen to formalize.",
      next_milestone: { offset_days: 5, description: "Diego sign-off on revised 14-week plan" },
      what_changed:
        "Diego softening; Aria escalating champion behavior. Phase-1 scope locked. Still red until Diego formally signs.",
      help_needed: "Need PS partner availability confirmed by next Tuesday so the 14-week plan stays credible.",
    },
    {
      daysAgo: 6,
      meeting_type: "internal",
      title: "Helix — Pursuit Sync (Q1 Close Push)",
      summary:
        "Internal sync: revised 14-week plan in Diego's hands; we expect a verbal yes Friday. Risk: legal redlines on the SOW are slowing procurement. Marcus to engage GC office directly.",
      key_topics: "q1-close-push, sow, legal",
      decisions_made: "Marcus owns GC engagement on SOW redlines.",
      open_questions: "Can we hold the Q1 close date if SOW slips by a week?",
      customers: [],
      technical_environment: { current_stack: "n/a", pain_points: "n/a", requirements: "n/a" },
      action_items: [
        {
          description: "Engage Helix GC office on SOW redlines",
          owner: "marcus.li@elastic.co",
          due_offset_days: 2,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "neutral" },
      next_meeting: { offset_days: 4, agenda: "Status check post-Diego review" },
      tags: ["internal", "escalation", "action-required"],
      tech_status: "red",
      tech_status_reason: "Q1 close at material risk: SOW legal redlines and Diego sign-off both still open.",
      path_to_tech_win: "Diego sign-off + SOW redlines closed by next Wednesday.",
      next_milestone: { offset_days: 4, description: "Verbal Diego yes + SOW progress update" },
      what_changed: "Legal track now in critical path. Q1 commit slipping likelihood up week-over-week.",
      help_needed: "Need exec air cover for the SOW negotiation if redlines stall.",
    },
  ],

  // -------- Helix Splunk Migration (yellow upside, $680K) ---------------
  "HELIX-MIG-2026Q3": [
    {
      daysAgo: 25,
      meeting_type: "poc",
      title: "Helix Splunk Migration — POC Kickoff",
      summary:
        "Kicked off the Splunk-to-Elastic migration POC. Aria's team has data flowing into our sandbox. Two SPL-to-ESQL conversion edge cases identified that we will need to document.",
      key_topics: "splunk-migration, esql, poc-kickoff",
      decisions_made: "POC runs through end of Q2; Phase-1 dashboards by mid-May.",
      open_questions: "Will the conversion edge cases require manual rewrites or can our tooling handle them?",
      customers: [
        { name: "Aria Chen", title: "Director Platform Engineering", role_flag: "champion" },
        { name: "Sam Verde", title: "SRE Lead", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack: "Splunk Enterprise 9.x, internal Lucene search",
        pain_points: "SPL to ESQL conversion friction; tooling immaturity",
        requirements: "Documented playbook for the two edge cases hit so far",
        integrations: "OTEL collector, internal data warehouse",
      },
      action_items: [
        {
          description: "Document the two SPL-to-ESQL edge cases",
          owner: "jordan.kim@elastic.co",
          due_offset_days: 4,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "positive", champion_signals: "Aria pushing this in parallel to platform deal" },
      competitive_landscape: { incumbent: "Splunk", competitors_evaluating: ["Splunk"] },
      demo_poc_request: {
        description: "8-week Splunk migration POC",
        success_criteria: "Convert 70% of priority dashboards with no rewrites",
        timeline: "Now through end of Q2",
      },
      next_meeting: { offset_days: 10, agenda: "POC mid-point review" },
      tags: ["migration", "demo-request", "follow-up-scheduled"],
      tech_status: "yellow",
      tech_status_reason: "POC running cleanly but conversion edge cases need a documented playbook.",
      path_to_tech_win:
        "Close out the two conversion edge cases with documented workarounds, then convert ≥70% of priority dashboards by mid-May.",
      next_milestone: { offset_days: 10, description: "POC mid-point review" },
      what_changed: "POC kicked off cleanly. Two minor edge cases identified.",
    },
  ],

  // -------- Lattice Insurance Observability (green upside, $310K) -------
  "LATTICE-OBS-2026Q2": [
    {
      daysAgo: 12,
      meeting_type: "demo",
      title: "Lattice Insurance Observability — Solution Demo",
      summary:
        "Walked through the unified obs platform for Andre and his SRE team. Strong reactions to the OTEL ingest workflow and the cross-tenant cost view. Andre asked us to send a TCO comparison vs. their current Datadog spend.",
      key_topics: "demo, otel, tco",
      decisions_made: "Send TCO comparison; schedule a hands-on workshop.",
      open_questions: "Can we beat their Datadog renewal price by 25%?",
      customers: [
        { name: "Andre Wallace", title: "Director SRE", role_flag: "decision_maker" },
        { name: "Priti Sharma", title: "Sr SRE", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack: "Datadog (logs + APM), Grafana on-prem for two BUs",
        pain_points: "Datadog renewal sticker shock; cross-BU cost attribution missing",
        requirements: "Cross-tenant cost view; OTEL native ingest",
        scale: "~3 TB/day logs",
      },
      action_items: [
        {
          description: "Send TCO comparison vs Datadog",
          owner: "steve.leung@elastic.co",
          due_offset_days: 2,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "positive", champion_signals: "Andre asked about our PS partner network" },
      competitive_landscape: { incumbent: "Datadog", competitors_evaluating: ["Datadog"] },
      next_meeting: { offset_days: 9, agenda: "TCO walkthrough" },
      tags: ["demo-request", "competitive"],
      tech_status: "green",
      tech_status_reason: "Demo landed cleanly; technical evaluator engaged; TCO is the next gate.",
      path_to_tech_win: "Land TCO that beats Datadog renewal by ≥20%; schedule hands-on workshop in May.",
      next_milestone: { offset_days: 9, description: "TCO walkthrough with Andre" },
      what_changed: "Status flipped from yellow to green — Andre actively engaged after the demo.",
    },
  ],

  // -------- Lattice Site Search (green pipeline, $140K) -----------------
  "LATTICE-SEARCH-2026Q4": [
    {
      daysAgo: 22,
      meeting_type: "discovery",
      title: "Lattice Site Search — Initial Discovery",
      summary:
        "Quick intro call. Site-search refresh is a Q4 priority but the team is heads-down on the obs deal first. They want to revisit in late Q3.",
      key_topics: "site-search, qualification",
      decisions_made: "Park until late Q3; send relevant case study.",
      open_questions: "Are they tied to their current vector store?",
      customers: [{ name: "Mira Khoury", title: "Sr Software Engineer" }],
      technical_environment: {
        current_stack: "Algolia for site search, internal Postgres pgvector for semantic",
        pain_points: "Algolia cost at scale; pgvector relevance tuning",
        requirements: "Better hybrid search relevance; lower TCO",
      },
      action_items: [
        {
          description: "Send hybrid-search case study",
          owner: "steve.leung@elastic.co",
          due_offset_days: 5,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "neutral" },
      next_meeting: { offset_days: 90, agenda: "Q3 re-engagement" },
      tags: ["technical"],
      tech_status: "green",
      tech_status_reason: "Healthy pipeline-stage opp; revisit in Q3.",
      path_to_tech_win: "Re-engage in late Q3; offer hands-on workshop on hybrid search.",
      next_milestone: { offset_days: 90, description: "Q3 re-engagement call" },
      what_changed: "Initial discovery complete; parked appropriately.",
    },
  ],

  // -------- Polaris SIEM Replacement (RED commit, $950K) ----------------
  "POLARIS-SEC-2026Q2": [
    {
      daysAgo: 30,
      meeting_type: "poc",
      title: "Polaris SIEM Replacement — POC Mid-Point Review",
      summary:
        "POC mid-point review. Detection content is on track. Two integration items at risk: 1) ICS/SCADA telemetry parsers don't yet match our Beats library; 2) their custom YARA-based threat-hunt workflow needs an Elastic equivalent. Devon, the SecOps lead, is publicly skeptical.",
      key_topics: "siem-replacement, ics-scada, yara, integrations",
      decisions_made: "Build a parser ETA timeline; propose hunt-builder demo",
      open_questions: "Can we get product to commit to ICS/SCADA parser delivery in Q2?",
      customers: [
        { name: "Devon Larkspur", title: "SecOps Lead", role_flag: "blocker" },
        { name: "Tess Olu", title: "Detection Engineer", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack: "Splunk + custom Beats; ICS/SCADA via custom parsers",
        pain_points: "ICS/SCADA parser maintenance; YARA threat-hunt workflow",
        requirements: "Documented parser timeline; threat-hunt workflow parity",
        integrations: "ICS/SCADA, CrowdStrike, Defender",
        constraints: "Cannot send raw OT telemetry to public cloud",
      },
      action_items: [
        {
          description: "Get product commitment on ICS/SCADA parsers",
          owner: "morgan.patel@elastic.co",
          due_offset_days: -5,
          status: "open",
        },
        {
          description: "Demo Elastic threat-hunt builder to Tess",
          owner: "morgan.patel@elastic.co",
          due_offset_days: 1,
          status: "open",
        },
      ],
      customer_sentiment: {
        overall: "concerned",
        concerns: "Devon publicly skeptical; Tess pushing back internally on his behalf",
        objections: "ICS/SCADA gap is a hard requirement",
        champion_signals: "Tess loaded sample telemetry into our sandbox already",
      },
      competitive_landscape: {
        incumbent: "Splunk",
        competitors_evaluating: ["Splunk", "Microsoft Sentinel"],
      },
      demo_poc_request: {
        description: "12-week SIEM replacement POC",
        success_criteria: "Parser parity + threat-hunt workflow parity",
        audience: "Devon's SecOps team",
      },
      next_meeting: { offset_days: 7, agenda: "Threat-hunt builder demo" },
      tags: ["security", "competitive", "escalation", "has-objections"],
      tech_status: "red",
      tech_status_reason:
        "ICS/SCADA parser gap is a hard requirement and product has not committed to a delivery date. Devon is openly skeptical.",
      path_to_tech_win:
        "1) Get product written commitment on ICS/SCADA parser delivery in Q2. 2) Demo threat-hunt builder to Tess and Devon together. 3) Convert Devon from blocker to neutral.",
      next_milestone: { offset_days: 7, description: "Threat-hunt builder demo with Devon present" },
      what_changed: "Status flipped to red after Devon's pushback. Forecast at risk if product commitment slips.",
      help_needed: "Need product to commit to ICS/SCADA parser delivery in writing.",
    },
    {
      daysAgo: 10,
      meeting_type: "technical-review",
      title: "Polaris SIEM — Threat-Hunt Builder Demo",
      summary:
        "Demoed the threat-hunt builder. Tess loved it; Devon attended for the second half and asked sharp questions about IOC pivot performance. He left with a 'maybe' instead of a 'no' — material progress.",
      key_topics: "threat-hunt, ioc, demo",
      decisions_made: "Tess will rebuild her top-5 hunt queries in our builder by next Friday.",
      open_questions: "Are IOC pivot timings within Devon's SLA expectations at scale?",
      customers: [
        { name: "Devon Larkspur", title: "SecOps Lead", role_flag: "blocker" },
        { name: "Tess Olu", title: "Detection Engineer", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack: "Splunk threat-hunt workflow",
        pain_points: "Long IOC pivot times in Splunk",
        requirements: "Sub-3s IOC pivot at billion-doc scale",
      },
      action_items: [
        {
          description: "Provide IOC pivot benchmark numbers at billion-doc scale",
          owner: "morgan.patel@elastic.co",
          due_offset_days: 3,
          status: "open",
        },
      ],
      customer_sentiment: {
        overall: "neutral",
        champion_signals: "Tess will rebuild her top-5 hunts in our builder",
      },
      next_meeting: { offset_days: 9, agenda: "Hunt builder rebuild walkthrough" },
      tags: ["security", "technical"],
      tech_status: "red",
      tech_status_reason:
        "Hunt-builder demo helped but ICS/SCADA parser gap is unchanged. Tech win still gated on product commitment.",
      path_to_tech_win: "Same as last week + IOC pivot benchmark to satisfy Devon.",
      next_milestone: { offset_days: 9, description: "Tess walks Devon through her rebuilt hunts" },
      what_changed: "Devon softened from skeptic to neutral. Still red overall — parser gap persists.",
      help_needed: "Still waiting on written product commitment for ICS/SCADA parsers.",
    },
  ],

  // -------- Polaris AI Search (green upside, $225K) ---------------------
  "POLARIS-AISEARCH-2026Q3": [
    {
      daysAgo: 14,
      meeting_type: "demo",
      title: "Polaris AI Search — Demo with Knowledge Mgmt Team",
      summary:
        "Quick demo of vector search and reranking for their internal docs corpus. Strong reception. Will follow up with a small POC kit.",
      key_topics: "ai-search, vector, rerank",
      decisions_made: "Send POC kit and sample notebook.",
      open_questions: "Are they comfortable with our embedding model choice?",
      customers: [{ name: "Olu Adeyemi", title: "KM Lead", role_flag: "champion" }],
      technical_environment: {
        current_stack: "Elasticsearch 7.x for keyword search; no vector layer yet",
        pain_points: "Search relevance complaints from end-users",
        requirements: "Drop-in semantic uplift on existing index",
      },
      action_items: [
        {
          description: "Send POC kit + sample notebook",
          owner: "morgan.patel@elastic.co",
          due_offset_days: 4,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "positive" },
      next_meeting: { offset_days: 14, agenda: "POC kit walkthrough" },
      tags: ["demo-request"],
      tech_status: "green",
      tech_status_reason: "Healthy upside; champion engaged; POC kit is the next step.",
      path_to_tech_win: "Land POC kit, validate semantic uplift, expand to broader corpus.",
      next_milestone: { offset_days: 14, description: "POC kit walkthrough" },
      what_changed: "Demo went well; momentum is positive.",
    },
  ],

  // -------- Meridian Serverless (yellow commit, $1.1M) ------------------
  "MERIDIAN-SVL-2026Q2": [
    {
      daysAgo: 17,
      meeting_type: "technical-review",
      title: "Meridian Serverless — Cost Model Walkthrough",
      summary:
        "Walked Brent and the infra team through three serverless consolidation scenarios. Architecture is agreed. The price gap relative to their current spend is the remaining blocker — Brent needs to see a regional price breakdown before approving.",
      key_topics: "serverless, cost-model, regional",
      decisions_made: "Provide regional price breakdown by April 28.",
      open_questions: "Will the regional breakdown close the gap to their current spend?",
      customers: [
        { name: "Brent Holloway", title: "VP Infrastructure", role_flag: "decision_maker" },
        { name: "Indira Bhatt", title: "Sr Infra Engineer", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack: "Self-managed Elasticsearch on EC2; in-house cost dashboards",
        pain_points: "Cluster ops burden; capacity planning toil",
        requirements: "Regional price parity vs current self-managed spend",
        scale: "5 TB/day ingest, multi-region",
      },
      action_items: [
        {
          description: "Deliver regional price breakdown across 3 scenarios",
          owner: "steve.leung@elastic.co",
          due_offset_days: 3,
          status: "open",
        },
      ],
      customer_sentiment: {
        overall: "neutral",
        concerns: "Price gap to current self-managed spend",
        champion_signals: "Indira advocating internally for the move",
      },
      next_meeting: { offset_days: 7, agenda: "Regional pricing review" },
      tags: ["pricing", "technical"],
      tech_status: "yellow",
      tech_status_reason: "Architecture agreed; price gap is the remaining blocker.",
      path_to_tech_win: "Land the regional breakdown, close the price gap, then move to commercial.",
      next_milestone: { offset_days: 7, description: "Regional pricing review with Brent" },
      what_changed: "Architecture confirmed; pricing now sole blocker.",
      help_needed: "Need pricing desk to expedite regional breakdown.",
    },
  ],

  // -------- Stratum Observability (green upside, $575K) -----------------
  "STRATUM-OBS-2026Q3": [
    {
      daysAgo: 20,
      meeting_type: "poc",
      title: "Stratum Observability — POC Week-2 Sync",
      summary:
        "POC Week 2: ingest pipeline running, dashboards being built. Customer team self-serving most of the work. Healthy momentum.",
      key_topics: "observability-poc, ingest, dashboards",
      decisions_made: "Continue POC through end of May.",
      open_questions: "n/a",
      customers: [{ name: "Naomi Weeks", title: "SRE Manager", role_flag: "champion" }],
      technical_environment: {
        current_stack: "Datadog + open-source Loki",
        pain_points: "Datadog cost; Loki maintenance",
        requirements: "Single platform for logs + metrics + APM",
        scale: "2 TB/day",
      },
      action_items: [
        {
          description: "Review dashboard quality at week 4",
          owner: "jordan.kim@elastic.co",
          due_offset_days: 14,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "positive", champion_signals: "Naomi self-serving most of the build" },
      next_meeting: { offset_days: 14, agenda: "POC week-4 review" },
      tags: ["demo-request", "follow-up-scheduled"],
      tech_status: "green",
      tech_status_reason: "POC progressing without intervention; champion is self-serving the work.",
      path_to_tech_win: "Land week-4 review, week-6 readout, then commercial.",
      next_milestone: { offset_days: 14, description: "POC week-4 review" },
      what_changed: "Healthy momentum; nothing blocking.",
    },
  ],

  // -------- Redwood Logistics (stale, $165K, no recent meeting) ---------
  "REDWOOD-LOG-2026Q4": [
    {
      daysAgo: 62,
      meeting_type: "discovery",
      title: "Redwood Logistics Search — Initial Discovery",
      summary:
        "Initial discovery for a logistics-search refresh. Customer interest was real but the project was deprioritized for a freight-network rewrite. No re-engagement since.",
      key_topics: "logistics-search, discovery",
      decisions_made: "Re-engage when freight rewrite project ends (estimated Q3).",
      open_questions: "When will the freight rewrite actually conclude?",
      customers: [{ name: "Ramona Cole", title: "Director Engineering" }],
      technical_environment: {
        current_stack: "Solr + custom logistics search service",
        pain_points: "Search latency on tracking lookups",
        requirements: "Sub-200ms tracking lookup at 10x current scale",
      },
      action_items: [
        {
          description: "Schedule Q3 re-engagement",
          owner: "morgan.patel@elastic.co",
          due_offset_days: -30,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "neutral" },
      tags: ["technical"],
      tech_status: "yellow",
      tech_status_reason: "Stale — no meeting in 60+ days. Hygiene gap.",
      path_to_tech_win: "Re-engage with Ramona this month; reset expectations on Q3 re-start.",
      next_milestone: { offset_days: 14, description: "Re-engagement call" },
      what_changed: "Nothing this week — that's the problem.",
      help_needed: "Need AE to reach back out and re-establish cadence.",
    },
  ],

  // -------- Nimbus AI Search (green upside, $260K) ----------------------
  "NIMBUS-AISEARCH-2026Q2": [
    {
      daysAgo: 15,
      meeting_type: "demo",
      title: "Nimbus AI Search Pilot — Discovery + Demo",
      summary:
        "First call with Nimbus, a net-new logo. Showed the vector + reranking story; strong reaction. Pilot scoping kicked off.",
      key_topics: "vector, rerank, net-new",
      decisions_made: "Scope a 4-week pilot.",
      open_questions: "Do they have a labeled relevance dataset we can use?",
      customers: [
        { name: "Marisol Day", title: "Head of Product", role_flag: "decision_maker" },
        { name: "Quinn Tabor", title: "Senior Engineer", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack: "Postgres full-text + custom embedding service",
        pain_points: "Recall on long-tail queries",
        requirements: "Hybrid retrieval + reranking",
      },
      action_items: [
        {
          description: "Send pilot scope draft",
          owner: "steve.leung@elastic.co",
          due_offset_days: 5,
          status: "open",
        },
      ],
      customer_sentiment: { overall: "positive" },
      next_meeting: { offset_days: 14, agenda: "Pilot scope walkthrough" },
      tags: ["demo-request"],
      tech_status: "green",
      tech_status_reason: "Net-new logo; healthy first call.",
      path_to_tech_win: "Land pilot scope, run pilot in May, expand in June.",
      next_milestone: { offset_days: 14, description: "Pilot scope walkthrough" },
      what_changed: "Net-new logo entered the pipeline.",
    },
  ],
};

// --- Main -----------------------------------------------------------------

async function main(): Promise<void> {
  if (!process.env.ELASTIC_CLOUD_ID?.trim() || !process.env.ELASTIC_API_KEY?.trim()) {
    console.error(
      "Missing ELASTIC_CLOUD_ID or ELASTIC_API_KEY. See the Elastic Serverless Setup Guide in PROJECT_BRIEF.md.",
    );
    process.exit(1);
  }

  const csvPath = process.argv[2]?.trim() || DEFAULT_CSV_PATH;

  let elastic: ElasticService;
  try {
    elastic = new ElasticService();
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Failed to create ElasticService.");
    process.exit(1);
  }

  try {
    await elastic.ping();
  } catch (err) {
    console.error("\nCould not reach Elasticsearch. Verify credentials and that the project is not paused.\n");
    if (err instanceof errors.ResponseError) {
      console.error(`HTTP ${err.meta.statusCode}: ${err.message}`);
    } else if (err instanceof Error) {
      console.error(err.message);
    }
    process.exit(1);
  }

  const opps = loadOpps(csvPath);
  console.log(`\n[seed-demo-notes] Loaded ${opps.length} opportunities from ${csvPath}`);

  let totalNotes = 0;
  let createdNotes = 0;
  let updatedNotes = 0;
  let totalActionItems = 0;
  const skippedOpps: string[] = [];

  for (const opp of opps) {
    const specs = SCENARIOS[opp.opp_id];
    if (!specs?.length) {
      skippedOpps.push(opp.opp_id);
      continue;
    }
    for (const spec of specs) {
      const note = buildNote(opp, spec);
      try {
        const { outcome } = await elastic.indexNote(note, { updatedBy: opp.owner_se_email });
        if (outcome === "created") createdNotes++;
        else updatedNotes++;
        totalNotes++;
      } catch (e) {
        console.error(
          `  ✗ Failed to index note for ${opp.opp_id} (${spec.meeting_type}, ${spec.daysAgo}d ago):`,
          e instanceof Error ? e.message : e,
        );
        continue;
      }
      try {
        await denormalizeActionItems({
          note_id: note.note_id,
          account: note.account ?? undefined,
          meeting_date: note.meeting_date ?? undefined,
          title: note.title ?? undefined,
          action_items: note.action_items ?? undefined,
        });
        totalActionItems += note.action_items?.length ?? 0;
      } catch (e) {
        console.error(
          `  ! Action-item denorm failed for ${opp.opp_id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    console.log(`  ✓ ${opp.opp_id} — ${specs.length} note(s)`);
  }

  console.log("\n--- Demo notes seed complete ---\n");
  console.log(`  Notes indexed:    ${totalNotes} (created: ${createdNotes}, updated: ${updatedNotes})`);
  console.log(`  Action items:     ${totalActionItems}`);
  if (skippedOpps.length) {
    console.log(
      `  Opps without scenario template (skipped): ${skippedOpps.length}\n    ${skippedOpps.join(", ")}\n`,
    );
    console.log(
      "  → Add a SCENARIOS entry in scripts/seed-demo-notes.ts if you want demo notes for those.",
    );
  }
  console.log("\nNext steps:");
  console.log("  npm run run:rollups   # compute account + opportunity rollups from these notes");
  console.log("  npm run run:alerts    # fire severity-aware alerts (overdue items, opportunity-at-risk)");
  console.log("  npm run run:digest    # generate Friday SE + Manager digests in the Inbox + Drive\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
