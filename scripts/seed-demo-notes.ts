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

const LONG_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Los_Angeles",
});

function formatLongDate(iso: string): string {
  return LONG_DATE_FMT.format(new Date(iso));
}

const MEETING_TYPE_LABEL: Record<DemoNoteSpec["meeting_type"], string> = {
  discovery: "Discovery",
  demo: "Demo",
  "technical-review": "Technical review",
  poc: "POC sync",
  qbr: "Executive / QBR",
  internal: "Internal pursuit sync",
};

function durationForMeetingType(type: DemoNoteSpec["meeting_type"]): number {
  switch (type) {
    case "internal":
      return 30;
    case "demo":
      return 45;
    case "discovery":
    case "technical-review":
    case "poc":
      return 50;
    case "qbr":
      return 60;
  }
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
  /**
   * MEDDPICC — Decision Process. Free-form description of the customer's
   * internal approval flow on this opportunity (named approvers, gates,
   * sequence, expected timing). Indexed onto the note and rolled up into
   * `medpicc.decision_process` for the Risk Tracker coverage card.
   */
  decision_process?: string;
  /** Hand-authored, time-stamped transcript excerpt rendered into the Granola-style transcript body. */
  transcript_detail?: string;
  /**
   * Optional override for the note author. Used to seed AE-authored notes
   * (and similar non-SE-authored content) so the `/team` page's
   * Author role filter has actual cross-author data to surface.
   */
  author_override?: {
    email: string;
    name: string;
    role: "SA" | "AE" | "CA" | "SAM" | "SAD" | "SAVP" | "RVP" | "AVP";
  };
}

interface RenderTranscriptInput {
  title: string;
  meetingDate: string;
  meetingType: string;
  durationMin: number;
  attendees: IngestNoteInput["attendees"];
  transcriptExcerpt?: string;
  summary: string;
  keyTopics?: string;
  decisions?: string;
  openQuestions?: string;
  decisionProcess?: string;
  accountDisplay: string;
}

/**
 * Renders a meeting note into the format a Granola export uses: header with
 * date and attendees, the transcript excerpt (when one was hand-authored),
 * and the meeting-summary template Granola fills in below the timeline.
 */
function renderGranolaTranscript(input: RenderTranscriptInput): string {
  const lines: string[] = [];
  lines.push(input.title);
  lines.push(
    `${input.meetingDate} · ${input.meetingType} · ${input.durationMin} min · ${input.attendees.length} attendees`,
  );
  lines.push("");
  lines.push("Attendees");
  for (const a of input.attendees) {
    const company = a.role_flag === "internal" ? "Elastic" : input.accountDisplay;
    lines.push(`- ${a.name} — ${a.title}, ${company}`);
  }
  lines.push("");
  if (input.transcriptExcerpt) {
    lines.push("Transcript excerpt");
    lines.push(input.transcriptExcerpt);
    lines.push("");
  }
  lines.push("Meeting summary");
  lines.push(input.summary);
  if (input.keyTopics) {
    lines.push("");
    lines.push(`Key topics: ${input.keyTopics}`);
  }
  if (input.decisions) {
    lines.push("");
    lines.push("Decisions made");
    lines.push(input.decisions);
  }
  if (input.openQuestions && input.openQuestions.trim() && input.openQuestions.trim().toLowerCase() !== "n/a") {
    lines.push("");
    lines.push("Open questions");
    lines.push(input.openQuestions);
  }
  if (input.decisionProcess && input.decisionProcess.trim()) {
    lines.push("");
    lines.push("Decision process");
    lines.push(input.decisionProcess.trim());
  }
  return lines.join("\n");
}

function buildNote(opp: OppRow, spec: DemoNoteSpec): IngestNoteInput {
  const slug = `${spec.meeting_type}-${spec.daysAgo}`;
  const id = noteId(opp.opp_id, slug);
  const acctSlug = accountSlug(opp.account);
  const author = spec.author_override
    ? {
        email: spec.author_override.email,
        name: spec.author_override.name,
        role: spec.author_override.role,
        title:
          spec.author_override.role === "AE"
            ? "Account Executive"
            : spec.author_override.role === "CA"
              ? "Customer Architect"
              : spec.author_override.role === "SAM"
                ? "SA Manager"
                : "Solutions Architect",
      }
    : {
        email: opp.owner_se_email,
        name: opp.owner_se_name,
        role: "SA" as const,
        title: "Solutions Architect",
      };
  const internalAttendees: IngestNoteInput["attendees"] = [
    { name: author.name, title: author.title, company: "Elastic", email: author.email, role_flag: "internal" },
  ];
  if (author.email !== opp.owner_se_email) {
    internalAttendees.push({
      name: opp.owner_se_name,
      title: "Solutions Architect",
      company: "Elastic",
      email: opp.owner_se_email,
      role_flag: "internal",
    });
  }
  if (author.email !== opp.owner_ae_email) {
    internalAttendees.push({
      name: opp.owner_ae_name,
      title: "Account Executive",
      company: "Elastic",
      email: opp.owner_ae_email,
      role_flag: "internal",
    });
  }
  const attendees: IngestNoteInput["attendees"] = [
    ...internalAttendees,
    ...spec.customers.map((c) => ({
      name: c.name,
      title: c.title,
      company: opp.account_display,
      email: customerEmail(c.name, acctSlug),
      role_flag: c.role_flag,
    })),
  ];
  const meetingIso = isoDateAtNoon(spec.daysAgo);
  const transcript = renderGranolaTranscript({
    title: spec.title,
    meetingDate: formatLongDate(meetingIso),
    meetingType: MEETING_TYPE_LABEL[spec.meeting_type],
    durationMin: durationForMeetingType(spec.meeting_type),
    attendees,
    transcriptExcerpt: spec.transcript_detail?.trim(),
    summary: spec.summary,
    keyTopics: spec.key_topics,
    decisions: spec.decisions_made,
    openQuestions: spec.open_questions,
    decisionProcess: spec.decision_process,
    accountDisplay: opp.account_display,
  });
  return {
    note_id: id,
    meeting_group_id: `demo-${opp.opp_id.toLowerCase()}-${spec.meeting_type}`,
    account: opp.account,
    opportunity: opp.opp_id,
    opportunity_id: opp.opp_id,
    team: opp.region,
    author_email: author.email,
    author_name: author.name,
    author_role: author.role,
    attendees,
    meeting_date: meetingIso,
    ingested_by: opp.owner_se_email,
    meeting_purpose: spec.meeting_type,
    title: spec.title,
    summary: spec.summary,
    transcript,
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
    decision_process: spec.decision_process,
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
      decision_process:
        "Three named gates ahead of the May 12 steering review: FedRAMP-aligned commercial deployment story (in writing), SAML SSO with internal IdP via SCIM, and an on-prem ingest exception for high-sensitivity tenants. Stacy Reyes (Director SecOps) writes the recommendation memo to Janelle (CISO); Janelle delivers to the Aurora board mid-May. Rohan Pillai (Compliance) signs off on PHI policy. Splunk renewal stays as Plan B with procurement.",
      summary:
        "Reviewed current Splunk + Phantom footprint, the team's pain with index lifecycle costs, and the must-have set for replacement: SAML SSO with their internal IdP, FedRAMP-aligned deployment, and on-prem (private region) ingest. Stacy (Director, SecOps) confirmed Elastic is the preferred path if those three boxes can be checked. Nothing about the data model concerns them — the platform conversation is the gate.",
      key_topics: "siem-replacement, saml, on-prem, fedramp, splunk",
      decisions_made:
        "Aurora will run a head-to-head detection-content evaluation against incumbent in Q2. Elastic is the named alternative.",
      open_questions:
        "1) Can Elastic Cloud Serverless meet the FedRAMP-aligned deployment story for their commercial workloads in 2026? 2) Confirm SAML SSO with their internal IdP via SCIM. 3) Do we have an on-prem deployment exception process for high-sensitivity tenants?",
      transcript_detail: [
        "[00:08] Stacy Reyes (Director, SecOps): I'm going to say the quiet part out loud — if we walk into steering without a FedRAMP-aligned commercial story in writing, I'm recommending Splunk renewal. Procurement already has the paperwork drafted.",
        "[00:22] Bryan Cole (Sr Detection Engineer): We're bought in technically — detection portability looked strong in the sandbox. But Stacy's right; this is an exec-risk conversation now, not a lab bake-off.",
        "[00:41] Steve Leung (Elastic): Understood. We're drafting the FedRAMP-aligned deployment narrative this week and we'll pre-brief you before the May 12 readout.",
        "[01:05] Stacy Reyes: Good — because Procurement told me yesterday they're freezing net-new spend unless we document the on-prem ingest exception. That's what flipped my steering slides from yellow to red.",
      ].join("\n"),
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
      decision_process:
        "May 12 steering review is the gate that unlocks Stacy's recommendation memo to Janelle. Three open gates remain: FedRAMP-aligned commercial deployment language in writing, SAML NameID config recipe published, and on-prem ingest exception. Bryan Cole (Sr Detection Engineer, champion) committed to demoing one converted detection rule live at the May 12 readout — that demo is part of the gate.",
      summary:
        "Walked through SAML and SCIM provisioning end-to-end with Lena and the Aurora IdP team. Identified one gap: their IdP version emits a non-standard NameID format that our SAML provider supports via custom mapping but is not yet documented for that release line — we will publish a tested recipe by Tuesday. Detection-content portability discussion landed strongly: Bryan ran the top-30 Splunk detection rules through our SPL-to-ESQL migration tool overnight and 21 of 30 converted cleanly, with the remaining 9 being mostly subsearch patterns we have known workarounds for. Bryan asked for the migration engineer to join the next call and committed to demoing one converted rule running live against a sample feed at the May 12 readout.",
      key_topics: "saml, scim, idp, esql, migration",
      decisions_made:
        "Publish a tested SAML/SCIM config recipe for their IdP version by Tuesday. Bryan will load the top-30 detection rules into our sandbox and demo one running live at the May 12 readout. Migration engineer to attend the next session to walk through the 9 subsearch patterns.",
      open_questions: "Is the NameID mapping configurable in our SAML provider via the standard custom-claim mechanism, or does it require a feature ticket?",
      transcript_detail: [
        "[00:04] Lena Park (Security Architect): I'll be direct — our internal IdP is on an older release line with a non-standard NameID format. We see that mapping issue burn six months on every vendor onboarding.",
        "[00:18] Steve Leung (Elastic SA): Our SAML provider does support custom NameID mappings, but the recipe isn't documented for your IdP version. I'll publish a tested config recipe by Tuesday — I'd rather hand you something my team has actually run than send you to a doc.",
        "[00:31] Bryan Cole (Sr Detection Engineer): While Lena chases the IdP track — I ran our top-30 detection rules through your SPL-to-ESQL migration tool last night. 21 of 30 converted cleanly. The remaining 9 are mostly subsearch patterns.",
        "[00:48] Steve Leung: That's better than I expected. Subsearches are usually the hardest. Want me to bring our migration engineer on the next call to walk through the patterns?",
        "[01:02] Bryan Cole: Yes please. And for the May 12 readout — I'd like to demo one of those rules running live against our sample feed.",
      ].join("\n"),
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
      decision_process:
        "Aurora's path to recommendation: May 12 steering review (Stacy + Janelle + Rohan + Aurora exec sponsor) is the gate; without all three FedRAMP/SAML/on-prem items landing in writing, Stacy will recommend Splunk renewal to the board. Our path: Marcus pre-briefs Stacy 1:1 on May 8 to neutralize surprises; Priya pushes product on the FedRAMP commercial doc; Ed escalates to Kevin to attend May 12 as Elastic exec sponsor.",
      summary:
        "Pursuit team alignment eight days out from the May 12 steering review. Three open items remain in the critical path: the FedRAMP-aligned 2026 commercial doc, the SAML NameID config recipe, and the on-prem ingest exception for high-sensitivity tenants. Steve has the SAML recipe landing Friday and Bryan's already validated 21 of 30 detection rules in the sandbox. Priya owns the FedRAMP narrative push internally — Mark from product owes her a callback today. Marcus will pre-brief Stacy 1:1 on May 8 to neutralize surprises before the steering. Ed (SA Manager) is escalating to Kevin to be the exec sponsor on May 12; without an Elastic exec in the room, the steering reads as us not taking it seriously.",
      key_topics: "pursuit-strategy, escalation, fedramp",
      decisions_made:
        "Marcus to pre-brief Stacy 1:1 on May 8. Priya owns the FedRAMP narrative push to product. Ed escalates to Kevin to attend May 12 as exec sponsor. Marcus owns the product/exec conversation on the on-prem exception.",
      open_questions: "Will Kevin commit to attending the May 12 steering as Elastic exec sponsor, and will product land FedRAMP-aligned 2026 commercial language in writing this week?",
      transcript_detail: [
        "[00:03] Marcus Li (AE): May 12 steering is in eight days. Three open items: FedRAMP doc, SAML NameID recipe, and the on-prem exception. Stacy will not greenlight without all three landing.",
        "[00:18] Steve Leung (SA): SAML recipe is mine — publishing it Friday. Bryan's already validated 21 of 30 rules in the sandbox. The FedRAMP doc is the one I cannot move alone.",
        "[00:32] Priya Shah (AE): I'll own the FedRAMP narrative push internally. Mark from product owes me a callback today.",
        "[00:44] Ed Salazar (SA Manager): I'm escalating to Kevin to be the exec sponsor on May 12. Without an Elastic exec in the room, the steering reads as us not taking it seriously.",
        "[00:58] Marcus Li: Agreed. Let's pre-brief Stacy 1:1 on May 8 — I'll get her calendar today.",
      ].join("\n"),
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
    {
      daysAgo: 42,
      meeting_type: "discovery",
      title: "Aurora Health Security — Initial Executive Discovery (AE-led)",
      decision_process:
        "Janelle Boswick (CISO) is the named decision maker; she delivers the recommendation to the Aurora board mid-May. Stacy Reyes (Director SecOps) drives the technical evaluation and writes the recommendation memo. Rohan Pillai (Compliance) holds the policy gate — PHI cannot traverse public-cloud control planes; without a clean compliance read, the deal does not move. Procurement is a separate track and is already drafting the Splunk renewal as Plan B at $2.3M. Sequence: technical sign-off → Stacy's memo → Janelle to board → procurement engages.",
      summary:
        "Priya led the first discovery with the Aurora exec team — Janelle (CISO), Stacy (Director SecOps), Rohan (Compliance). Established budget ($1.85M FY26 SIEM transformation, vs $2.3M Splunk renewal as Plan B), explicit decision criteria (FedRAMP-aligned commercial deployment, SAML/SCIM with internal IdP, on-prem ingest exception for high-sensitivity tenants, cost parity), and the policy line on PHI never traversing public-cloud control planes. Steve onboarding to lead the technical track next week.",
      key_topics: "exec-discovery, decision-criteria, fedramp, hipaa, splunk-replacement",
      decisions_made:
        "Aurora committed to evaluating Elastic as the primary; Splunk renewal kept as Plan B. Board recommendation due mid-May.",
      open_questions:
        "Who is Elastic's exec sponsor for the board recommendation? Can product confirm FedRAMP commercial timing in writing?",
      transcript_detail: [
        "[00:04] Janelle Boswick (CISO): The board signed off on $1.85M of FY26 SIEM transformation budget. Splunk renewal at flat-rate is $2.3M for the same scope. We're not paying that.",
        "[00:18] Stacy Reyes (Director, SecOps): Decision criteria are crisp — FedRAMP-aligned commercial deployment, SAML/SCIM with our IdP, on-prem ingest exception for high-sensitivity tenants, and cost parity. Hit those, you're our recommendation to the board.",
        "[00:34] Rohan Pillai (Compliance): I'll add — we cannot send PHI through any public-cloud control plane. That's policy, not preference.",
        "[00:48] Priya Shah (Elastic AE): Understood. We'll line our SE up to start the architecture conversation next week and bring our security PM into the loop on the FedRAMP narrative.",
        "[01:02] Janelle Boswick: Good. We need a recommendation in front of the board by mid-May. Procurement is a separate track but they're already drafting the Splunk renewal as Plan B.",
      ].join("\n"),
      author_override: {
        email: "priya.shah@elastic.co",
        name: "Priya Shah",
        role: "AE",
      },
      customers: [
        { name: "Janelle Boswick", title: "CISO", role_flag: "decision_maker" },
        { name: "Stacy Reyes", title: "Director, SecOps", role_flag: "decision_maker" },
        { name: "Rohan Pillai", title: "Director, Compliance", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack: "Splunk Enterprise 9.x, Splunk Phantom (SOAR), 14 ingest clusters, ServiceNow ITSM",
        pain_points: "Splunk index lifecycle costs growing 30% YoY; long detection-tuning cycles; SOC analyst onboarding burden",
        requirements: "FedRAMP-aligned commercial deployment, SAML/SCIM, on-prem ingest exception, cost parity vs Splunk renewal",
        integrations: "Internal IdP via SAML/SCIM, ServiceNow, PagerDuty, Crowdstrike",
        constraints: "Cannot send PHI through public-cloud control plane — policy.",
        scale: "~24 TB/day ingest, 60 SOC analysts, 110 detection content packs",
      },
      action_items: [
        {
          description: "Hand off architecture track to Steve Leung",
          owner: "priya.shah@elastic.co",
          due_offset_days: -38,
          status: "complete",
        },
        {
          description: "Aurora to send IdP/SCIM specs to Elastic SE team",
          owner: customerEmail("Stacy Reyes", "aurorahealthsystems"),
          due_offset_days: -35,
          status: "complete",
        },
        {
          description: "Brief Elastic security PM on FedRAMP-aligned narrative",
          owner: "priya.shah@elastic.co",
          due_offset_days: -32,
          status: "complete",
        },
      ],
      commitments: [
        {
          description: "Elastic to deliver FedRAMP-aligned deployment doc by April 30",
          committed_by: "priya.shah@elastic.co",
          timeline: "by April 30",
        },
        {
          description: "Aurora to keep Splunk renewal pricing as Plan B (parallel track)",
          committed_by: customerEmail("Stacy Reyes", "aurorahealthsystems"),
          timeline: "parallel track",
        },
      ],
      customer_sentiment: {
        overall: "positive",
        champion_signals: "Stacy framed Elastic as the recommendation if we hit criteria.",
      },
      competitive_landscape: {
        incumbent: "Splunk",
        competitors_evaluating: ["Splunk", "Sumo Logic", "Microsoft Sentinel"],
        mentions: "Splunk renewal at $2.3M is the Plan B; Sentinel mentioned for the broader Microsoft estate.",
        differentiators: "Detection-content portability, ESQL, hybrid storage cost",
      },
      budget_timeline: {
        budget: "$1.85M ACV approved (vs $2.3M Splunk renewal as Plan B)",
        timeline: "Board recommendation mid-May; close target end of June",
        procurement: "MSA in place; SOW pending technical evaluation outcome",
        stage_signals: "discovery → architecture; named primary candidate",
      },
      next_meeting: { offset_days: -35, agenda: "SE-led architecture workshop with Stacy + Bryan" },
      tags: ["security", "competitive", "discovery", "exec-discovery", "splunk-replacement", "ae-led"],
      tech_status: "yellow",
      tech_status_reason:
        "Discovery just complete; criteria documented; tech engagement starts next week. Healthy starting position.",
      path_to_tech_win:
        "1) Align SE on architecture. 2) Land FedRAMP-aligned commercial deployment doc. 3) Confirm SAML/SCIM. 4) Negotiate on-prem ingest exception. 5) Board recommendation by mid-May.",
      next_milestone: { offset_days: -35, description: "SE-led architecture workshop kickoff" },
      what_changed:
        "AE-led exec discovery confirmed budget ($1.85M vs $2.3M Splunk Plan B), decision criteria, and procurement plan-B. Steve onboarding to lead technical track.",
    },
    {
      daysAgo: 8,
      meeting_type: "qbr",
      title: "Aurora Health — Competitive Steering & Procurement Sync",
      decision_process:
        "Friday exec sync flipped this red. Stacy is now driving the May 12 steering as the explicit decision moment with Janelle (CISO) and Rohan (Compliance) on the call. Without the FedRAMP doc in writing, Stacy will recommend Splunk renewal to the board. Procurement has both quotes drafted and is following Stacy's recommendation.",
      summary:
        "Procurement sync called by Mick (Procurement) after Splunk submitted a $2.05M renewal counter with a 14-month term. Mick on a 5-business-day clock unless we can deliver a written on-prem ingest exception process by May 12. Sentinel walked out of the room — Microsoft pulled their meeting because they couldn't commit to commercial FedRAMP timing either. We are now the only viable alternative if we land the FedRAMP + on-prem story.",
      key_topics: "procurement, splunk-renewal, sentinel-out, on-prem-exception, board-deadline",
      decisions_made:
        "Mick will hold the Splunk renewal pending Elastic on-prem exception process draft by May 12.",
      open_questions:
        "Can product confirm FedRAMP commercial timing in writing this week? Is there an exec sponsor confirmed for May 12 steering?",
      transcript_detail: [
        "[00:05] Mick Talbot (Procurement): Splunk just submitted a renewal at $2.05M with a 14-month term — they're trying to keep us through the next budget cycle. I have 5 business days to either counter-sign or disqualify.",
        "[00:19] Stacy Reyes (Director SecOps): Mick, you can't counter-sign while we're in active eval. Janelle, back me up.",
        "[00:24] Janelle Boswick (CISO): Agree. But Steve — your FedRAMP doc lands when?",
        "[00:33] Steve Leung (Elastic SA): Draft this Friday, walking it through with Stacy Monday. I'm pre-briefing her before the May 12 steering.",
        "[00:42] Mick Talbot: I will hold the renewal but only if we have a written exception process for the on-prem ingest by May 12. Without that I cannot defend Elastic to finance.",
        "[00:55] Stacy Reyes: Sentinel walked us yesterday — Microsoft pulled their meeting because they couldn't commit to commercial FedRAMP timing either. So you're not the only one with this problem, but you're the leader if you solve it.",
      ].join("\n"),
      customers: [
        { name: "Stacy Reyes", title: "Director, SecOps", role_flag: "decision_maker" },
        { name: "Janelle Boswick", title: "CISO", role_flag: "decision_maker" },
        { name: "Mick Talbot", title: "Procurement Lead", role_flag: "blocker" },
      ],
      technical_environment: {
        current_stack: "Splunk Enterprise 9.x; commercial-cloud Sentinel evaluation halted",
        pain_points: "Splunk renewal pricing pressure; FedRAMP commercial timing unconfirmed across all vendors",
        requirements: "Written on-prem ingest exception process by May 12",
        constraints: "Procurement on 5-business-day clock",
      },
      action_items: [
        {
          description: "Walk Mick through on-prem ingest exception process draft",
          owner: "steve.leung@elastic.co",
          due_offset_days: -3,
          status: "open",
        },
        {
          description: "Provide written cost-parity comparison vs Splunk renewal",
          owner: "priya.shah@elastic.co",
          due_offset_days: -1,
          status: "open",
        },
        {
          description: "Confirm exec sponsor for May 12 steering",
          owner: "ed.salazar@elastic.co",
          due_offset_days: 1,
          status: "open",
        },
      ],
      commitments: [
        {
          description: "Walk Mick through written on-prem exception process by May 8",
          committed_by: "steve.leung@elastic.co",
          timeline: "by May 8",
        },
        {
          description: "Cost-parity comparison vs Splunk renewal delivered this week",
          committed_by: "priya.shah@elastic.co",
          timeline: "this week",
        },
      ],
      customer_sentiment: {
        overall: "concerned",
        concerns: "Procurement clock is the immediate pressure; finance will act on May 12 either way.",
        objections: "Mick anchored on the on-prem exception document existing in writing.",
        champion_signals: "Stacy publicly defended the eval against Mick's procurement pressure.",
      },
      competitive_landscape: {
        incumbent: "Splunk",
        competitors_evaluating: ["Splunk"],
        mentions:
          "Sentinel pulled out (Microsoft couldn't commit to FedRAMP commercial timing). Sumo Logic out of scope.",
        differentiators: "Cost parity + on-prem exception is the leadership position now that Sentinel is out.",
      },
      budget_timeline: {
        budget: "$1.85M ACV (vs $2.05M Splunk renewal counter)",
        timeline: "May 12 steering = decision day",
        procurement: "5-business-day hold by Mick",
        stage_signals: "negotiation; competitive lead but unconfirmed",
      },
      next_meeting: { offset_days: 5, agenda: "May 12 steering review with exec sponsor" },
      tags: ["security", "competitive", "escalation", "procurement", "splunk-replacement", "has-objections"],
      tech_status: "red",
      tech_status_reason:
        "Splunk submitted aggressive renewal; procurement on a 5-day hold; Sentinel disqualified itself, leaving us as the leader if we land FedRAMP + on-prem doc by May 12.",
      path_to_tech_win:
        "1) Deliver written on-prem ingest exception process to Mick by May 8. 2) Walk Stacy through FedRAMP doc Monday pre-brief. 3) Cost-parity comparison delivered. 4) Exec sponsor present at May 12 steering.",
      next_milestone: { offset_days: 5, description: "May 12 steering review — go/no-go" },
      what_changed:
        "Splunk submitted renewal at $2.05M creating a 5-day procurement clock. Sentinel pulled out — we're the only viable alternative. Mick (Procurement) becomes a new stakeholder; he's anchored on the on-prem exception.",
      help_needed:
        "Need exec sponsor confirmed for May 12 steering. Need product to put FedRAMP commercial timing in writing this week.",
    },
    {
      daysAgo: 1,
      meeting_type: "internal",
      title: "Aurora Health — Internal Pre-Brief: Procurement Clock Compressed",
      decision_process:
        "Steering tomorrow. Stacy 1:1 pre-brief done May 8. Janelle (CISO) and Rohan (Compliance) on the steering. Kevin (Elastic exec sponsor) confirmed for the call. If FedRAMP doc lands in writing today, Stacy recommends Elastic and procurement engages this week. If it doesn't, Stacy recommends Splunk renewal and the deal slips to Q3 minimum.",
      summary:
        "Emergency internal sync. Mick (Procurement) called Wednesday — Splunk renewal clock compressed from 5 to 3 days. Stacy phoned Ed direct: if we walk into the May 12 board without the FedRAMP commercial commitment, she will recommend Splunk renewal. Product's Tuesday escalation pushed FedRAMP timing answer to next week. Ed escalating to Kevin tonight. Steve drafting customer commitment email for Monday morning delivery.",
      key_topics: "escalation, procurement-clock, board-deadline, splunk-replacement",
      decisions_made:
        "Ed escalating to Kevin tonight. Steve to send customer-facing commitment email same-day. Priya pulling cost-parity packet forward by 48h.",
      open_questions: "Will product SVP commit to FedRAMP commercial timing by Monday 9am ET?",
      transcript_detail: [
        "[00:02] Steve Leung (SA): Mick (Procurement) called yesterday. Splunk renewal is now on a 3-day clock, not 5. He needs the on-prem exception document by Tuesday or he files the Splunk PO.",
        "[00:12] Priya Shah (AE): I escalated to product on Tuesday. Their Wednesday SVP review pushed the FedRAMP commercial timing answer to next week. We don't have the ammunition.",
        "[00:22] Ed Salazar (SA Manager): Stacy's exact words to me on the phone Friday — 'If we walk into board on May 12 without that document, I'm recommending Splunk renewal.' This is the line. I'm escalating to Kevin tonight.",
        "[00:32] Steve Leung: I'm drafting an email to the customer right now confirming we'll have the document Monday morning before her board prep call. We do not control product, but we can control the customer-facing commitment.",
        "[00:44] Priya Shah: I'll pull the cost-parity packet forward 48 hours. Mick gets that Friday morning.",
      ].join("\n"),
      customers: [],
      technical_environment: {
        current_stack: "n/a (internal)",
        pain_points: "Procurement timeline compressed; product commitment outstanding",
        requirements: "Written FedRAMP commercial commitment from product by Monday 9am ET",
      },
      action_items: [
        {
          description: "Email Stacy confirming Monday 9am ET delivery of FedRAMP commercial commitment",
          owner: "steve.leung@elastic.co",
          due_offset_days: 0,
          status: "open",
        },
        {
          description: "Escalate to product SVP for FedRAMP commercial timing commitment",
          owner: "kevin.qadri@elastic.co",
          due_offset_days: 0,
          status: "open",
        },
        {
          description: "Deliver cost-parity packet to Mick (Procurement) Friday morning",
          owner: "priya.shah@elastic.co",
          due_offset_days: 1,
          status: "open",
        },
      ],
      commitments: [
        {
          description: "Deliver FedRAMP commercial commitment to Stacy by Monday 9am ET",
          committed_by: "steve.leung@elastic.co",
          timeline: "Monday 9am ET",
        },
        {
          description: "Cost-parity packet to Mick Friday morning",
          committed_by: "priya.shah@elastic.co",
          timeline: "Friday morning",
        },
      ],
      customer_sentiment: {
        overall: "concerned",
        concerns: "Customer board on May 12; procurement clock compressed; product timing uncertain.",
      },
      next_meeting: { offset_days: 4, agenda: "Stacy 1:1 pre-brief on FedRAMP doc walkthrough" },
      tags: ["security", "escalation", "internal", "action-required", "splunk-replacement", "executive-air-cover"],
      tech_status: "red",
      tech_status_reason:
        "Procurement clock compressed from 5 to 3 days. Customer board review May 12. We don't have the FedRAMP commercial commitment from product yet. Without it Stacy will recommend Splunk renewal on May 12.",
      path_to_tech_win:
        "Single critical path: written FedRAMP commercial commitment from product, in our hands by Monday morning. Customer-facing commitment email goes out today regardless.",
      next_milestone: { offset_days: 3, description: "Customer board review May 12 — make-or-break date" },
      what_changed:
        "Procurement clock compressed Friday → Monday. Stacy's phone call to Ed confirmed she will recommend Splunk renewal if we don't deliver. This deal is at the brink — flagged red across the board.",
      help_needed:
        "Kevin needs to escalate to product SVP today. We need the FedRAMP commercial commitment in writing by Monday 9am ET.",
    },
  ],

  // -------- Aurora Health observability (yellow upside, $420K) ----------
  "AURORA-OBS-2026Q3": [
    {
      daysAgo: 21,
      meeting_type: "discovery",
      title: "Aurora Observability — POC Scoping Discovery",
      decision_process:
        "Marco Halloran (Sr Platform Eng Mgr) is the named approver for the platform team's spend; he takes the recommendation to procurement. Funding is contingent on the security expansion landing first — the platform team will not fund a parallel motion. Q3 procurement is the trigger; no commercial conversation until security closes. Yuki (Observability Lead, champion) drives the POC execution.",
      summary:
        "Met with the platform-engineering team to scope a Q3 observability POC. Marco was direct: Datadog spend is up 40% YoY and they are already negotiating against tag-cardinality limits. Yuki has prior experience evaluating Elastic at her previous employer and was the most positive voice in the room on the OTEL ingest workflow. Strong alignment on the Datadog cost story and clear interest in unified metrics + logs + APM with a cross-tenant cost view — Marco called the cross-tenant cost view 'underpriced' as a differentiator. POC is scoped (6 weeks across 4 representative services, target ≥30% cost reduction at parity feature coverage) but funding is explicitly contingent on the security expansion landing — the platform team will not fund a parallel motion if security stalls.",
      key_topics: "observability-poc, datadog-replacement, apm",
      decisions_made: "Scope a 6-week POC starting in early Q3, contingent on the security deal closing. Target ≥30% cost reduction at parity feature coverage. Send POC scope document this week.",
      open_questions: "Will product approve free-tier APM agents during the POC window?",
      transcript_detail: [
        "[00:04] Marco Halloran (Sr Platform Eng Mgr): Our Datadog spend is up 40% YoY and we're already negotiating against tag-cardinality limits. The platform team won't fund a parallel motion if security stalls — I want that on the record.",
        "[00:21] Yuki Tanaka (Observability Lead): I evaluated Elastic at my previous job. The OTEL ingest workflow was the cleanest I'd seen.",
        "[00:33] Steve Leung (Elastic SA): The cross-tenant cost view is the differentiator most platform teams underprice. I'll send a POC scope draft this week — six weeks across four representative services, with a cost-per-tenant dashboard built in.",
        "[00:48] Marco Halloran: Hit ≥30% cost reduction at parity feature coverage and you have my approval to take it to procurement. But again — Q3 start contingent on security closing.",
      ].join("\n"),
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
      decision_process:
        "Karen Whitfield (CIO) is the decision maker; FY26 budget cycle close = Q1 commit. Diego Marin (VP Infra) sign-off in writing required on the technical track — without Diego's yes, Karen does not sign. Aria Chen (Director Plat Eng, champion) drives steering committee endorsement. Sequence: 14-week migration plan accepted by Diego → Karen signs SOW by May 22 → procurement closes within Q1.",
      summary:
        "Met with Karen (CIO) and Diego (VP Infrastructure). Helix is consolidating three observability and three search workloads onto one platform. We are the primary candidate; ServiceNow Cloud Observability is the secondary. Karen is pushing for a Q1 close to fold the spend into the FY26 budget. Diego raised concerns about a 12-week migration plan being too aggressive.",
      key_topics: "consolidation, observability, search, migration, executive",
      decisions_made: "Elastic moves into the technical evaluation as the primary; ServiceNow stays as the backup.",
      open_questions: "Can we deliver a credible 12-week migration plan that Diego will sign off on?",
      transcript_detail: [
        "[00:03] Karen Whitfield (CIO): We want Elastic — but Diego's team says your migration window is fantasy land. If we miss FY26 budget lock, this lands in Q2 next fiscal.",
        "[00:18] Diego Marin (VP Infrastructure): My concern isn't ambition — it's sequencing. Last night's batch normalization job failed three times against our telemetry replay harness. Until that stabilizes, I'm not signing anything that says twelve weeks.",
        "[00:39] Jordan Kim (Elastic): That replay failure maps to the Kafka shard sizing issue we logged — patch is in sandbox today.",
        "[00:52] Karen Whitfield: That's the kind of concrete tie-break I need in front of the board. Jordan — document that replay path with timestamps for Diego.",
      ].join("\n"),
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
      decision_process:
        "Diego Marin's sign-off on the 14-week plan is the technical gate; his bar is Phase-1 ingest stability demonstrated by week 4. Once Diego signs, Karen (CIO) signs the SOW. Aria (champion) is escalating to Karen in steering committee in parallel. Q1 contract close target preserved if plan lands this week.",
      summary:
        "Walked Aria through the migration estimator output. Phase-1 ingest scope agreed: robotic-fleet telemetry stream only (12 TB/day), with remaining workloads phased through Q2. Diego sat in for the second half — broke his pattern of pushing back on the entire timeline and instead anchored on a 16-week safety margin. Jordan proposed a 14-week revision with a Q1 contract close and Q2 phased rollout, contingent on demonstrable ingest stability by week 4. Diego said he can live with 14 if the stability bar is hit. Aria committed to getting our PS partner contacts to Jordan today, which closes the credibility loop on plan execution. Tech win still gated on Diego's formal sign-off.",
      key_topics: "migration-estimator, phase-1, robotic-fleet, kafka",
      decisions_made: "Phase-1 covers robotic-fleet telemetry only (12 TB/day); remaining workloads phased through Q2. Revised plan target: 14 weeks total with Q1 contract close. PS partner contacts to Jordan today.",
      open_questions: "Will Diego accept a 14-week plan with a Q1 contract close and Q2 phased migration if Phase-1 ingest stability is demonstrated by week 4?",
      transcript_detail: [
        "[00:04] Aria Chen (Director Plat Eng): I want to walk Diego through what the estimator output actually says. Phase-1 covers robotic-fleet telemetry only — 12 TB/day. Remaining workloads phase through Q2.",
        "[00:19] Diego Marin (VP Infra): Twelve weeks for Phase-1 alone? My team has burned twelve weeks on smaller cutovers.",
        "[00:31] Jordan Kim (Elastic SA): The breakdown is 4 weeks ingest stability, 4 weeks dashboard parity, 4 weeks dual-run. I'd like to revise to 14 weeks total with a Q1 contract close and a Q2 phased rollout.",
        "[00:46] Diego Marin: I can live with 14 if you can prove the ingest stability bar by week 4. My anchor is 16 weeks of safety margin — bring me 14 with hard milestones and I'll soften.",
        "[01:00] Aria Chen: I'll get our PS partner contacts to Jordan today; that closes the credibility loop.",
      ].join("\n"),
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
      decision_process:
        "Q1 close path: Diego verbal yes Friday → SOW redlines closed by next Wednesday → SOW signature by May 22. Helix GC office (Priscilla Vargas) is the procurement gatekeeper on three open redlines (LoL cap, DPA scope, OT-telemetry indemnification). Exec air cover (Kevin) on standby if redlines stall.",
      summary:
        "Internal pursuit sync at the Q1 close push. The revised 14-week plan is in Diego's hands; verbal yes expected Friday — Jordan reports the Phase-1 replay harness has been clean for four days, which removes the technical objection. Real risk this week is legal: three SOW redlines (LoL cap, DPA scope, OT-telemetry indemnification carve-out) still open with Helix GC and we are six days behind FY26 close target. Marcus is engaging GC office directly today and committing to a DPA counter-redline back to them by Thursday EOD. If we slip a week on SOW signature we lose Q1 commit. Ed offered to put Kevin on a call as exec air cover for the SOW negotiation if redlines stall — holding that play in reserve through Thursday's exchange.",
      key_topics: "q1-close-push, sow, legal",
      decisions_made:
        "Marcus owns GC engagement on SOW redlines and commits to a DPA counter-redline back to Helix GC by Thursday EOD. Exec air cover (Kevin) held in reserve through Thursday's redline exchange.",
      open_questions: "Can we hold the Q1 close date if SOW slips by a week, and if not, do we activate exec air cover Friday?",
      transcript_detail: [
        "[00:02] Marcus Li (AE): Diego has the revised 14-week plan. Verbal yes expected Friday. Real risk this week is legal — three SOW redlines still open with Helix GC and we're six days behind FY26 close.",
        "[00:16] Jordan Kim (Elastic SA): On the technical side, the Phase-1 replay harness has been clean for four days. I'm not worried about Diego's gate.",
        "[00:30] Marcus Li: Good. I'm engaging GC office directly today and will have the DPA counter-redline back to them by Thursday EOD. If we slip a week on the SOW signature, we lose Q1 commit.",
        "[00:44] Ed Salazar (SA Manager): Do we need exec air cover for the SOW negotiation? Kevin can join a call if it stalls.",
        "[00:56] Marcus Li: Holding that in reserve. Let's see where we are after Thursday's redline exchange.",
      ].join("\n"),
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
    {
      daysAgo: 28,
      meeting_type: "qbr",
      title: "Helix Platform — Commercial & Procurement Working Session (AE-led)",
      decision_process:
        "Karen (CIO) sets the criteria publicly: signed SOW by May 22, written Diego sign-off, phased migration with no all-or-nothing risk. Three SOW redlines tracked with named owners (Marcus on Elastic side; Priscilla Vargas — Helix GC — on Helix side). Priscilla cannot release SOW until all three redlines are resolved. Karen reaffirmed Elastic as the preferred path; Splunk renewal stays as contractual fallback if SOW slips.",
      summary:
        "Marcus led a commercial working session with Helix GC office. Karen (CIO) opened to set the tone: 'Helix wants Elastic — but the SOW lands in time for FY26 close or we slip.' Pricilla (GC) walked the three open redlines: limitation of liability cap, DPA scope, OT-telemetry indemnification carve-out. Diego reaffirmed the 14-week migration plan is acceptable IF Phase-1 ingest stabilizes by week 4. Karen restated decision criteria: signed SOW by May 22, technical sign-off from Diego, phased migration with no all-or-nothing risk.",
      key_topics: "paper-process, sow-redlines, commercial, exec-engagement, splunk-replacement",
      decisions_made:
        "Three SOW redlines tracked with named owners. May 22 SOW signature target reaffirmed. Diego's Phase-1 stability gate explicit.",
      open_questions:
        "Does our DPO have flex on DPA scope? Does our product attorney have a position on OT indemnification?",
      transcript_detail: [
        "[00:02] Karen Whitfield (CIO): I'm here to set the tone. Helix wants Elastic. The work this group is doing this morning is to determine whether the SOW lands in time for FY26 close. If not, we slip. Pricilla — your read on the redlines?",
        "[00:14] Priscilla Vargas (GC): Three open redlines: limitation of liability cap, data processing addendum scope, and the indemnification carve-out for OT telemetry. None are deal-breakers individually; collectively they have us 6 days behind.",
        "[00:32] Marcus Li (Elastic AE): On the LoL cap — we can move within published guidance. On DPA scope, I'll align with our DPO this afternoon and have a counter-redline by Thursday EOD. Indemnification on OT — that needs a product attorney; I'll engage tonight.",
        "[00:48] Diego Marin (VP Infra): My side is the same: the 14-week migration plan is acceptable IF Phase-1 ingest stabilizes by week 4. We've had two replay-harness failures this week.",
        "[01:02] Karen Whitfield: Decision criteria for me have not changed: signed SOW by May 22 to keep Q1; technical sign-off from Diego; phased migration with no all-or-nothing risk. Hit those, we sign.",
      ].join("\n"),
      author_override: {
        email: "marcus.li@elastic.co",
        name: "Marcus Li",
        role: "AE",
      },
      customers: [
        { name: "Karen Whitfield", title: "CIO", role_flag: "decision_maker" },
        { name: "Priscilla Vargas", title: "Helix General Counsel Office", role_flag: "blocker" },
        { name: "Diego Marin", title: "VP Infrastructure", role_flag: "blocker" },
      ],
      technical_environment: {
        current_stack: "Splunk Observability + Splunk Enterprise; OT telemetry on isolated network",
        pain_points: "SOW redline cycle 6 days behind; indemnification language for OT data novel",
        requirements: "DPA scope alignment, OT telemetry indemnification position, LoL cap within published guidance",
        constraints: "Helix policy requires OT data residency clauses in any vendor contract.",
      },
      action_items: [
        {
          description: "Counter-redline DPA scope back to Helix GC",
          owner: "marcus.li@elastic.co",
          due_offset_days: -25,
          status: "complete",
        },
        {
          description: "Engage Elastic product attorney on OT indemnification position",
          owner: "marcus.li@elastic.co",
          due_offset_days: -23,
          status: "complete",
        },
        {
          description: "Confirm LoL cap movement within published guidance",
          owner: "marcus.li@elastic.co",
          due_offset_days: -24,
          status: "complete",
        },
      ],
      commitments: [
        {
          description: "DPA counter-redline back to Helix GC by Thursday EOD",
          committed_by: "marcus.li@elastic.co",
          timeline: "by Thursday EOD",
        },
        {
          description: "OT indemnification position briefed back by Friday",
          committed_by: "marcus.li@elastic.co",
          timeline: "by Friday",
        },
      ],
      customer_sentiment: {
        overall: "neutral",
        concerns: "6-day commercial delta to FY26 close target; OT indemnification language is novel for both parties.",
        objections: "Pricilla cannot release SOW until all three redlines are resolved.",
        champion_signals: "Karen's opening statement reaffirmed Elastic preference publicly.",
      },
      competitive_landscape: {
        incumbent: "Splunk + Sumo + internal Lucene",
        competitors_evaluating: ["ServiceNow Cloud Observability", "Splunk"],
        mentions: "Splunk renewal still the contractual fallback if FY26 SOW slips.",
        differentiators: "Single platform for obs + search; phased migration story",
      },
      budget_timeline: {
        budget: "$2.4M ACV approved",
        timeline: "Signed SOW by May 22 to keep Q1 close",
        procurement: "MSA exists; SOW in active redline (3 open items)",
        stage_signals: "negotiation; commit; commercial track active",
      },
      next_meeting: { offset_days: -23, agenda: "DPA counter-redline review with Helix GC" },
      tags: ["competitive", "migration", "procurement", "exec-engagement", "paper-process", "splunk-replacement", "ae-led"],
      tech_status: "red",
      tech_status_reason:
        "SOW redlines on three open items; SE migration plan on track but Diego still needs Phase-1 stability proof; Karen reaffirmed criteria — signed SOW by May 22.",
      path_to_tech_win:
        "1) Close 3 SOW redlines (LoL, DPA, OT indemnification) by Thursday. 2) Stabilize Phase-1 ingest replay (2 harness failures must go to zero by week 4). 3) Confirm Diego sign-off. 4) SOW signature by May 22.",
      next_milestone: { offset_days: -21, description: "DPA counter-redline back to Helix GC" },
      what_changed:
        "AE-led commercial session. Karen reaffirmed she wants Elastic. Three SOW redlines on a 6-day delta from FY26 close target. Paper Process is well-defined: 3 redlines + signed SOW by May 22.",
      help_needed: "Need product attorney engagement on OT indemnification this week.",
    },
    {
      daysAgo: 12,
      meeting_type: "qbr",
      title: "Helix Platform — Executive Sponsor Pre-Brief (Karen + Elastic exec sponsor)",
      decision_process:
        "Karen named the holdout: her Chief Risk Officer. May 14 pre-read with Elastic exec sponsor + Helix CRO is the unlock that converts CRO from blocker to neutral. Karen's three asks for the board pre-read: credible 14-week plan with visible milestones, written Diego sign-off, contractual go-live commitment for Phase-1 by July 14 in the SOW. Once CRO is neutral, Karen signs and procurement closes within FY26 cycle.",
      summary:
        "Marcus convened our exec sponsor with Karen and Aria. Karen named three asks for the board pre-read: credible 14-week plan with visible milestones, Diego's sign-off documented in writing, and a contractual go-live commitment for Phase-1 by July 14. Aria reinforced ingest stability as the unlock for Diego. Karen revealed the holdout is her CRO and asked our exec to do a 30-minute pre-read on May 14. Our exec committed.",
      key_topics: "exec-engagement, board-pre-read, phase-1-go-live, splunk-replacement",
      decisions_made:
        "May 14 CRO pre-read scheduled. Phase-1 July 14 go-live to be added to SOW. Exec sponsor committed.",
      open_questions: "Will contracts agree to put Phase-1 July 14 go-live language in the SOW?",
      transcript_detail: [
        "[00:03] Karen Whitfield (CIO): Thank you for setting this up — I want to share the board narrative so your exec can speak to it. Three asks: a credible 14-week plan with visible milestones, Diego's sign-off documented in writing, and a contractual go-live commitment for Phase-1 by July 14.",
        "[00:18] Aria Chen (Director Plat Eng): The ingest stability is my number one. Last week's harness failure was Kafka shard sizing; Jordan's team had a patch in sandbox same-day. That's the kind of responsiveness that gets Diego to yes.",
        "[00:31] Steve Leung (Elastic SA): Phase-1 timeline is locked. Replay harness has been clean for 4 days. We can put the July 14 Phase-1 go-live in the SOW.",
        "[00:42] Karen Whitfield: Then I need your exec on a 30-minute board pre-read with my Chief Risk Officer. He's the holdout. Date: May 14.",
        "[00:54] Elastic Exec Sponsor: We'll be there. I'll deliver the 14-week plan personally to your CRO and walk him through the Diego sign-off process.",
      ].join("\n"),
      customers: [
        { name: "Karen Whitfield", title: "CIO", role_flag: "decision_maker" },
        { name: "Aria Chen", title: "Director Platform Engineering", role_flag: "champion" },
      ],
      technical_environment: {
        current_stack: "Splunk Observability for fleet telemetry; Phase-1 Elastic ingest in customer sandbox",
        pain_points: "Diego's Phase-1 stability bar; CRO holdout on board",
        requirements: "Contractual Phase-1 go-live by July 14; written Diego sign-off process",
      },
      action_items: [
        {
          description: "Calendar-hold May 14 CRO pre-read with Elastic exec sponsor",
          owner: "marcus.li@elastic.co",
          due_offset_days: -10,
          status: "complete",
        },
        {
          description: "Add Phase-1 July 14 go-live language to SOW draft",
          owner: "marcus.li@elastic.co",
          due_offset_days: -8,
          status: "complete",
        },
        {
          description: "Brief Elastic exec sponsor on Helix board narrative",
          owner: "ed.salazar@elastic.co",
          due_offset_days: -10,
          status: "complete",
        },
      ],
      commitments: [
        {
          description: "Phase-1 Helix robotic-fleet ingest live by July 14, 2026",
          committed_by: "steve.leung@elastic.co",
          timeline: "by July 14, 2026",
        },
        {
          description: "Elastic exec sponsor on CRO pre-read May 14",
          committed_by: "marcus.li@elastic.co",
          timeline: "May 14",
        },
      ],
      customer_sentiment: {
        overall: "positive",
        champion_signals: "Aria publicly defended Elastic's response speed in front of Karen.",
        concerns: "CRO is the holdout — risk-leaning by job description.",
      },
      competitive_landscape: {
        incumbent: "Splunk + Sumo + internal Lucene",
        competitors_evaluating: ["Splunk"],
        differentiators: "Phase-1 contractual go-live commitment; exec-level board pre-read",
      },
      budget_timeline: {
        budget: "$2.4M ACV approved",
        timeline: "May 14 CRO pre-read; May 22 SOW signature target",
        procurement: "SOW redlines in flight",
        stage_signals: "exec sponsor engaged; CRO is final holdout",
      },
      next_meeting: { offset_days: -5, agenda: "May 14 CRO pre-read with Elastic exec sponsor" },
      tags: ["competitive", "exec-engagement", "executive-air-cover", "migration", "splunk-replacement"],
      tech_status: "red",
      tech_status_reason:
        "Exec engaged but 3 conditions: 14-week plan, Diego sign-off, contractual Phase-1 by July 14. CRO pre-read on May 14 is the unlock.",
      path_to_tech_win:
        "Same as last week + put exec on the May 14 CRO pre-read; commit to July 14 Phase-1 go-live in SOW.",
      next_milestone: { offset_days: -5, description: "Elastic exec sponsor + Helix CRO pre-read" },
      what_changed:
        "Elastic exec sponsor now fully engaged. Karen named CRO as the holdout. May 14 pre-read scheduled — that's the unlock for board endorsement.",
      help_needed:
        "Need exec sponsor air-time on May 14 (already calendar-held). Need contracts to add Phase-1 go-live date language to SOW draft.",
    },
    {
      daysAgo: 2,
      meeting_type: "technical-review",
      title: "Helix Platform — Phase-1 Ingest Replay Regression (Kafka Broker Rebalance)",
      decision_process:
        "Tuesday's regression directly affects the May 14 CRO pre-read. RCA write-up will be delivered for the pre-read (Karen's three-asks include 'credible 14-week plan with visible milestones'). Patch on track for Friday delivery to customer-stage sandbox; replay-harness must hit zero failures before week 4 to clear Diego's stability gate. If patch lands clean, May 14 pre-read proceeds and SOW signature target stays May 22.",
      summary:
        "Phase-1 replay harness dropped 3.2M events on the OT-North path Tuesday at 02:14 UTC. Different root cause than the May 1 partition-skew patch — this is a transient broker-rebalance during a node replacement. Patch in code review today, sandbox validation Thursday, customer-stage sandbox Friday. Aria publicly defended Elastic on response speed: 'I have not seen this turnaround speed from Splunk in 18 months.' Diego asked for time-to-fix; Jordan committed to Friday.",
      key_topics: "regression, kafka-rebalance, phase-1-ingest, response-time, splunk-replacement",
      decisions_made:
        "Patch on track for Friday delivery to customer sandbox. RCA write-up to be delivered for May 14 board pre-read.",
      open_questions: "Will the broker-rebalance scenario reproduce reliably in the test matrix going forward?",
      transcript_detail: [
        "[00:04] Diego Marin (VP Infra): Tuesday at 02:14 UTC the replay harness dropped 3.2M events on the OT-North path. I need to know if it's the same Kafka shard issue we patched two weeks ago or something new.",
        "[00:18] Sam Verde (SRE Lead): I traced it to a transient broker-rebalance. Different root cause than the May 1 patch.",
        "[00:28] Jordan Kim (Elastic SA): Confirmed — the patch we shipped May 1 was for partition skew. Tuesday's drop was a broker rebalance during a node replacement. We've added the broker-rebalance scenario to the test matrix; it's reproducing in our sandbox now.",
        "[00:44] Diego Marin: Time-to-fix?",
        "[00:48] Jordan Kim: Patch in code review today, sandbox validation Thursday, customer-stage sandbox Friday. We'll publish a write-up with timestamps so you can attach it to your board pre-read.",
        "[01:02] Aria Chen (Director Plat Eng): Diego — for what it's worth, I have not seen this turnaround speed from Splunk in 18 months. The bug exists; the response is the differentiator.",
      ].join("\n"),
      customers: [
        { name: "Diego Marin", title: "VP Infrastructure", role_flag: "blocker" },
        { name: "Aria Chen", title: "Director Platform Engineering", role_flag: "champion" },
        { name: "Sam Verde", title: "SRE Lead", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack: "Phase-1 Elastic ingest in customer sandbox; Kafka source on customer-managed brokers",
        pain_points: "Phase-1 replay harness dropping events under broker-rebalance conditions",
        requirements: "Clean replay harness run for 48h before May 14 CRO pre-read",
        integrations: "Kafka source, OTEL collector",
        scale: "12 TB/day for Phase-1 only; 3.2M events dropped Tuesday",
      },
      action_items: [
        {
          description: "Ship broker-rebalance patch to customer sandbox",
          owner: "jordan.kim@elastic.co",
          due_offset_days: 2,
          status: "open",
        },
        {
          description: "Publish RCA write-up with timestamps for board pre-read",
          owner: "jordan.kim@elastic.co",
          due_offset_days: 4,
          status: "open",
        },
        {
          description: "Add broker-rebalance scenario to permanent test matrix",
          owner: "jordan.kim@elastic.co",
          due_offset_days: 7,
          status: "open",
        },
      ],
      commitments: [
        {
          description: "Broker-rebalance patch in customer sandbox by Friday May 9",
          committed_by: "jordan.kim@elastic.co",
          timeline: "by Friday May 9",
        },
        {
          description: "RCA write-up delivered for May 14 board pre-read",
          committed_by: "jordan.kim@elastic.co",
          timeline: "by May 13",
        },
      ],
      customer_sentiment: {
        overall: "neutral",
        concerns: "Second harness failure in two weeks raises Diego's caution.",
        champion_signals: "Aria publicly compared our response speed favorably vs Splunk in front of Diego.",
      },
      competitive_landscape: {
        incumbent: "Splunk",
        competitors_evaluating: ["Splunk"],
        differentiators: "Response time on production-impacting issues; transparent RCA",
      },
      next_meeting: { offset_days: 3, agenda: "Friday patch verification with Diego + Sam" },
      tags: ["competitive", "migration", "technical", "regression", "splunk-replacement"],
      tech_status: "red",
      tech_status_reason:
        "Second Phase-1 ingest replay regression — different root cause (broker-rebalance, not partition skew). Patch on track for Friday. Diego's sign-off depends on a clean week.",
      path_to_tech_win:
        "1) Ship broker-rebalance patch to customer sandbox by Friday. 2) Publish RCA write-up for board pre-read. 3) Maintain replay-harness clean streak through May 14 CRO call. 4) Contractual go-live July 14.",
      next_milestone: { offset_days: 2, description: "Broker-rebalance patch in customer sandbox; clean 48h run before May 14 pre-read" },
      what_changed:
        "Second harness failure surfaced Tuesday — different root cause from the May 1 patch. Aria publicly defended Elastic on response speed. Diego asked for time-to-fix; we committed to Friday.",
      help_needed:
        "Need product engineering to keep the Friday patch on track. If it slips, the May 14 CRO pre-read narrative falls apart.",
    },
  ],

  // -------- Helix Splunk Migration (yellow upside, $680K) ---------------
  "HELIX-MIG-2026Q3": [
    {
      daysAgo: 25,
      meeting_type: "poc",
      title: "Helix Splunk Migration — POC Kickoff",
      decision_process:
        "Aria pushing this in parallel to the platform deal; conditional on platform-deal close. Phase-1 dashboards converted by mid-May is the technical milestone. Not standalone procurement — this attaches to the platform contract once Karen signs. Splunk renewal is the fallback if the platform deal slips.",
      summary:
        "Kicked off the 8-week Splunk-to-Elastic migration POC running parallel to the platform consolidation track. Aria's team has data flowing into our sandbox as of yesterday and Sam's already exercised the SPL-to-ESQL migration tool on a representative slice. Two SPL-to-ESQL conversion patterns produced output that runs but does not match Splunk's behavior on edge cases: a stats-by with a streaming where, and an inputlookup chained into a join. Both have known workarounds in the Elastic docs that the auto-tool does not yet apply. Jordan committed to a documented playbook with side-by-side SPL/ESQL examples by Wednesday. Target for POC: 70% of priority dashboards converted by mid-May with no manual rewrites for that 70%.",
      key_topics: "splunk-migration, esql, poc-kickoff",
      decisions_made: "POC runs through end of Q2 with Phase-1 dashboards converted by mid-May. Jordan delivers a documented playbook for the two SPL-to-ESQL edge-case patterns by Wednesday.",
      open_questions: "Will the two known edge-case patterns be the only ones, or will more surface as Aria's team converts deeper into the dashboard backlog?",
      transcript_detail: [
        "[00:04] Aria Chen (Director Plat Eng): Data is flowing into your sandbox as of yesterday. We have two SPL-to-ESQL conversions where the auto-tool produced something that runs but doesn't match Splunk's behavior on edge cases.",
        "[00:20] Sam Verde (SRE Lead): One is a stats-by with a streaming where; the other is an inputlookup chained into a join. Both have known workarounds in the Elastic docs but the auto-tool doesn't apply them yet.",
        "[00:34] Jordan Kim (Elastic SA): Acknowledged. I'll document the two patterns with side-by-side SPL/ESQL examples and have the playbook to you by Wednesday.",
        "[00:48] Aria Chen: That works. We're targeting 70% of priority dashboards converted by mid-May — without rewrites for that 70%.",
      ].join("\n"),
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
      decision_process:
        "Andre Wallace (Director SRE) drives the decision and owns the procurement entry point. Renewal cycle running with Datadog as the contractual fallback. Hands-on workshop next week is the next gate before commercial. Cost target is explicit: beat the Datadog renewal by 25% — Andre will share rough current ARR on a side channel.",
      summary:
        "Walked through the unified observability platform for Andre and his SRE team. Andre called our OTEL ingest workflow 'the cleanest he's seen' and immediately surfaced that they are in an active Datadog renewal cycle — he wants a TCO comparison this week. Priti (Sr SRE, champion) has been hand-rolling cross-BU cost attribution in Grafana for two BUs and explicitly said our out-of-the-box cross-tenant cost view would save her team a quarter of SRE work. Andre asked about our PS partner network in the same conversation, which is a strong buy-signal at this stage. To target a 25% beat over the Datadog renewal we will need their current ARR — Andre will share the rough number on a side channel. Workshop scheduled for next week with the PS partner network in attendance.",
      key_topics: "demo, otel, tco",
      decisions_made: "Send TCO comparison vs Datadog renewal by Wednesday. Schedule hands-on workshop with PS partner network for next week. Andre will share approximate Datadog renewal ARR via a side channel.",
      open_questions: "Can we beat their Datadog renewal price by 25%, and what is the actual current ARR Andre will share?",
      transcript_detail: [
        "[00:03] Andre Wallace (Director SRE): The OTEL ingest workflow you just walked through — that's the cleanest I've seen. We're in a Datadog renewal cycle right now and I want a TCO comparison.",
        "[00:18] Priti Sharma (Sr SRE): The cross-tenant cost view is what we've been hand-rolling in Grafana for two BUs. If you have that out-of-the-box we save an SRE quarter of work.",
        "[00:32] Steve Leung (Elastic SA): I'll have the TCO over to you by Wednesday. To beat your renewal price by 25% we'd need your actual current ARR — can you share the renewal quote, even rough?",
        "[00:46] Andre Wallace: I can ballpark it. We'll set up a side channel for the actual number. Workshop next week — bring your PS partner network.",
      ].join("\n"),
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
      decision_process:
        "Site search refresh is sequenced behind the obs deal; nothing starts until that closes. Q3 re-engagement is the trigger — no Q4 commercial conversation until then. Mira (Sr SW Eng) is the entry point and would drive a willing rebuild rather than a forced migration; neither Algolia nor pgvector is up for renewal in 2026. No procurement engaged.",
      summary:
        "Intro call with Mira (Sr Software Engineer driving the site-search refresh). The team is heads-down on the observability deal first — Andre's team has the runway and Mira can't start anything until that closes. Site-search refresh is a Q4 priority and Mira asked us to re-engage in late Q3. Their current state is Algolia for keyword and an internal Postgres pgvector for semantic; neither contract is up for renewal in 2026, so this is a 'willing rebuild on a better foundation' rather than a forced migration — the easiest scenario for us. Mira asked for a hybrid-search case study and a hands-on workshop offer for Q3.",
      key_topics: "site-search, qualification",
      decisions_made: "Park until late Q3 with a calendar trigger. Send hybrid-search case study and a Q3 hands-on workshop offer this week.",
      open_questions: "When the obs deal closes, will the site-search project actually move up the priority list, or will another initiative absorb the engineering capacity?",
      transcript_detail: [
        "[00:03] Mira Khoury (Sr SW Eng): Site-search is on our Q4 list but we cannot start anything until the obs deal closes. Andre's team has the runway right now.",
        "[00:14] Steve Leung (Elastic SA): Understood — we'll park and reach back out late Q3. What's keeping you on Algolia and pgvector for now?",
        "[00:26] Mira Khoury: Honestly, no contract pressure. Neither is up for renewal in 2026. So this is more 'we want to rebuild on a better foundation' than 'we need to migrate.'",
        "[00:38] Steve Leung: That's actually the easiest scenario for us — willing rebuild. I'll send our hybrid-search case study and a hands-on workshop offer for Q3.",
      ].join("\n"),
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
      decision_process:
        "Devon Larkspur (SecOps Lead) is the current blocker; he must flip from blocker to neutral before SecOps approves. Tess Olu (Detection Eng, champion) is advocating internally on Devon's daily exec. Two unlocks required: (1) product written commitment on ICS/SCADA parser delivery in Q2; (2) IOC pivot benchmark at 2.1B-doc scale. Internal SecOps approval precedes procurement engagement; Splunk renewal in flight as Plan B.",
      summary:
        "POC mid-point review. Detection content is on track. Customer leadership explicitly tied the deal's RYG to operational stability — last week's OT batch normalization runs failed three nights in a row; Devon's team initially attributed that to Elastic ingest. Two integration items remain at risk: 1) ICS/SCADA telemetry parsers don't yet match our Beats library; 2) their custom YARA-based threat-hunt workflow needs an Elastic equivalent. Devon, the SecOps lead, is publicly skeptical.",
      key_topics: "siem-replacement, ics-scada, yara, integrations",
      decisions_made: "Build a parser ETA timeline; propose hunt-builder demo",
      open_questions: "Can we get product to commit to ICS/SCADA parser delivery in Q2?",
      transcript_detail: [
        "[00:06] Devon Larkspur (SecOps Lead): I'm going to call this directly — the ICS/SCADA parser backlog is not theoretical for us. Last Tuesday our normalization pipeline dropped three consecutive OT batches; leadership thinks it's Elastic because that's what's running in the POC.",
        "[00:27] Tess Olu (Detection Engineer): To be fair — two of those failures were our OT gateway firmware — but Devon's point stands: without signed parser SLAs I can't defend Elastic in the exec daily.",
        "[00:44] Morgan Patel (Elastic): We'll separate OT gateway noise from Elastic ingest with a joint incident timeline and attach product owners on ICS parsers before Friday.",
        "[01:02] Devon Larkspur: Good — because until that lands, I'm scoring this POC red regardless of how slick the hunt UI looks.",
      ].join("\n"),
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
      decision_process:
        "Hunt-builder demo neutralized the secondary objection — Devon explicitly said the hunt-builder is no longer a 'no' from him. ICS/SCADA parser commitment remains the primary blocker. Two unlocks still required for Devon to flip from blocker to neutral: product written commitment on parser delivery + IOC pivot benchmark at 2.1B-doc scale. Then SecOps approval, then procurement.",
      summary:
        "Demoed the threat-hunt builder live to Tess (champion) and Devon (blocker, SecOps Lead). Tess is convinced it is materially better than Splunk and committed to rebuilding her top-5 hunt queries in our sandbox by next Friday. Devon attended for the second half and asked sharp, specific questions on IOC pivot performance at scale — they sit on 2.1 billion events in their hot tier and the bar is sub-3-second pivot. He explicitly said the hunt-builder is no longer a 'no' from him; the ICS/SCADA parser commitment remains the bigger blocker but this is material progress on the secondary objection. Morgan committed to a billion-doc-scale benchmark (engineered like real hunts, not synthetic best-case) by Wednesday.",
      key_topics: "threat-hunt, ioc, demo",
      decisions_made: "Tess will rebuild her top-5 hunt queries in our builder by next Friday. Morgan delivers an IOC pivot benchmark at billion-doc scale (real hunt patterns, not synthetic) by Wednesday.",
      open_questions: "Will IOC pivot timings hit sub-3-second on Devon's 2.1B-event hot tier under realistic hunt patterns?",
      transcript_detail: [
        "[00:04] Tess Olu (Detection Eng): The query builder is genuinely better than what we have in Splunk. I'm rebuilding our top-5 hunts in your sandbox by next Friday.",
        "[00:18] Devon Larkspur (SecOps Lead): The hunt UI looks fine — what I need is IOC pivot timing at our scale. We're at 2.1 billion events in our hot tier; sub-3-second pivot is the bar.",
        "[00:34] Morgan Patel (Elastic SA): Fair test. I'll give you a benchmark at billion-doc scale by Wednesday — and I'll engineer the test the same way your hunters work, not a synthetic best-case.",
        "[00:48] Devon Larkspur: That's the right answer. Bring me a real number. The ICS/SCADA parser commitment is still the bigger blocker, but the hunt-builder is no longer a 'no' from me.",
      ].join("\n"),
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
    {
      daysAgo: 38,
      meeting_type: "discovery",
      title: "Polaris Energy — SIEM Discovery (CISO + SecOps Leadership, AE-led)",
      decision_process:
        "Two-stage decision: SecOps Lead (Devon) signs off technically first, then CISO and procurement engage. Tess (Detection Eng) is named champion; Devon is named blocker. Product commitment on ICS/SCADA parsers is the precondition before SecOps will green-light. Splunk renewal is the contractual fallback in flight; Microsoft Sentinel is the secondary alternative being evaluated.",
      summary:
        "Nina led the first exec discovery with Polaris CISO and OT engineering leadership. Budget capped at $950K with CRO visibility ($1.4M Splunk extension as Plan B). Decision criteria explicit: parser parity (ICS/SCADA library), detection authoring speed, $950K cost cap, end-of-Q2 modernization or Splunk extension. Reed (OT Engineering) flagged ICS/SCADA parser library as a make-or-break technical hard requirement.",
      key_topics: "exec-discovery, decision-criteria, ot-scada, splunk-replacement, cost-cap",
      decisions_made:
        "Polaris will modernize SIEM by end of Q2 OR extend Splunk for $1.4M. Elastic named primary candidate. Morgan Patel onboarding to lead technical track.",
      open_questions: "Can product commit to ICS/SCADA parser delivery timeline before Q2 close?",
      transcript_detail: [
        "[00:03] Kassidy Whitlow (CISO): The board mandate is clear — we either modernize SIEM by end of Q2 or we extend Splunk for $1.4M and miss our compliance posture targets. Modernization budget is $950K capped.",
        "[00:16] Devon Larkspur (SecOps Lead): Pain is real. Splunk index lifecycle on OT data is up 40% YoY because we can't tier the partition layer. We're paying for hot storage on cold data. Detection authoring has 3-week lead times. SOC analyst churn is 35% annualized.",
        "[00:32] Reed Allenby (Director, OT Engineering): The OT side is the hard part. ICS/SCADA telemetry parsers — Splunk built these over 5 years. Whatever replaces it has to match the parser library or we lose detection coverage. That's a hard requirement.",
        "[00:48] Nina Ortega (Elastic AE): Decision criteria captured: parser parity, detection authoring speed, $950K cap, end-of-Q2 close. Anything I'm missing on Economic Buyer side?",
        "[01:00] Kassidy Whitlow: Final sign-off comes from me, but the CRO has $950K visibility too. Cost overrun above $950K kills the project — he's clear on that.",
      ].join("\n"),
      author_override: {
        email: "nina.ortega@elastic.co",
        name: "Nina Ortega",
        role: "AE",
      },
      customers: [
        { name: "Kassidy Whitlow", title: "CISO", role_flag: "decision_maker" },
        { name: "Devon Larkspur", title: "SecOps Lead", role_flag: "blocker" },
        { name: "Reed Allenby", title: "Director, OT Engineering", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack: "Splunk Enterprise; custom ICS/SCADA parser library built over 5 years",
        pain_points: "Splunk index lifecycle costs +40% YoY on OT data; 3-week detection authoring lead time; 35% SOC analyst churn",
        requirements: "ICS/SCADA parser parity (hard requirement); detection authoring speed; $950K cost cap",
        integrations: "ICS/SCADA OT telemetry, CrowdStrike, Defender",
        constraints: "OT raw telemetry cannot transit public-cloud control plane",
        scale: "~12 TB/day OT + 8 TB/day IT",
      },
      action_items: [
        {
          description: "Hand off SE engagement to Morgan Patel",
          owner: "nina.ortega@elastic.co",
          due_offset_days: -34,
          status: "complete",
        },
        {
          description: "Polaris to send ICS/SCADA parser inventory to Elastic SE team",
          owner: customerEmail("Devon Larkspur", "polarisenergy"),
          due_offset_days: -32,
          status: "complete",
        },
        {
          description: "Schedule architecture review with Devon's team",
          owner: "nina.ortega@elastic.co",
          due_offset_days: -33,
          status: "complete",
        },
      ],
      commitments: [
        {
          description: "Elastic to deliver parser parity timeline by end of April",
          committed_by: "nina.ortega@elastic.co",
          timeline: "by end of April",
        },
      ],
      customer_sentiment: {
        overall: "neutral",
        concerns: "Parser library parity is a hard requirement with no flex.",
        champion_signals: "Reed described parser parity as make-or-break — engaged but not yet a champion.",
      },
      competitive_landscape: {
        incumbent: "Splunk",
        competitors_evaluating: ["Splunk", "Microsoft Sentinel"],
        mentions: "Splunk extension at $1.4M is the Plan B; Sentinel under casual evaluation, not formal.",
        differentiators: "Detection authoring speed; hybrid storage; ESQL-based hunt builder",
      },
      budget_timeline: {
        budget: "$950K capped (CRO visibility, hard ceiling) vs $1.4M Splunk extension as Plan B",
        timeline: "End of Q2 modernization or Splunk extension",
        procurement: "MSA in place; SOW conditional on parser commitment",
        stage_signals: "discovery → POC; named primary",
      },
      next_meeting: { offset_days: -33, agenda: "SE-led architecture review with Devon's team" },
      tags: ["security", "competitive", "discovery", "exec-discovery", "splunk-replacement", "ot-scada", "ae-led"],
      tech_status: "yellow",
      tech_status_reason:
        "Discovery just complete; criteria captured; SE engagement starts next week. Healthy starting position with one hard requirement (parser parity) flagged.",
      path_to_tech_win:
        "1) Document parser parity timeline. 2) POC scope with detection authoring SLA. 3) Hold $950K cap. 4) End-of-Q2 close gated on parser commitment.",
      next_milestone: { offset_days: -33, description: "SE-led architecture review with Devon's team" },
      what_changed:
        "AE-led exec discovery confirmed budget ($950K cap), decision criteria (parser parity + authoring speed + cost), and the parallel Splunk extension as Plan B.",
    },
    {
      daysAgo: 3,
      meeting_type: "internal",
      title: "Polaris Energy SIEM — Internal Pursuit Sync (Parser Commitment Escalation)",
      decision_process:
        "Pursuit critical path: ICS/SCADA parser commitment in writing + IOC pivot benchmark + Devon sentiment shift from blocker to neutral. Kevin escalating to product alongside Aurora's FedRAMP ask the same week — same SVP, same forcing function. Once Devon is neutral, SecOps approves and CISO + procurement engage.",
      summary:
        "Two weeks since we asked product for a written ICS/SCADA parser delivery commitment. No movement. Devon's exec daily is now scoring this POC red. Kassidy emailed yesterday with a hard May 14 ultimatum: parser commitment in writing or Splunk extension. Same week as Aurora's board review — Ed will escalate both deals to Kevin in one packet because they're gated on the same product commitment.",
      key_topics: "escalation, parser-commitment, splunk-replacement, executive-air-cover",
      decisions_made:
        "Ed escalating to Kevin tonight, paired with Aurora escalation. Hunt-builder demo with Devon present still scheduled Friday — keeps the customer engaged regardless of product commitment.",
      open_questions: "Will product SVP commit to ICS/SCADA parser delivery alongside Aurora FedRAMP commitment?",
      transcript_detail: [
        "[00:04] Morgan Patel (SE): Two weeks since we asked product for a written ICS/SCADA parser delivery commitment. No movement. Devon's exec daily is now scoring this POC red and the CRO has $950K visibility.",
        "[00:18] Nina Ortega (AE): Kassidy emailed yesterday — she said and I quote, 'If we don't have a parser commitment in writing by May 14, we extend Splunk.'",
        "[00:30] Ed Salazar (SA Manager): That's the same week as Aurora's board review. Both deals — Aurora and Polaris — are gated on a single set of product asks: written commitments on commercial deployment timing. I need to escalate both at once to Kevin.",
        "[00:44] Morgan Patel: Tess (Detection Engineer / champion) rebuilt 18 of her top hunts in our builder this week. She's ready to demo to Devon Friday. Question is whether the demo matters without the parser commitment.",
        "[00:58] Ed Salazar: Demo still matters — keeps Devon engaged. But the deal closes on parser commitment, not on demo polish. Escalating tonight.",
      ].join("\n"),
      customers: [],
      technical_environment: {
        current_stack: "n/a (internal)",
        pain_points: "Product commitment overdue 14 days; customer ultimatum issued",
        requirements: "Written ICS/SCADA parser delivery commitment from product by May 13",
      },
      action_items: [
        {
          description: "Escalate ICS/SCADA parser commitment to product SVP (paired with Aurora FedRAMP escalation)",
          owner: "ed.salazar@elastic.co",
          due_offset_days: 0,
          status: "open",
        },
        {
          description: "Run hunt-builder demo with Devon present (engagement protection)",
          owner: "morgan.patel@elastic.co",
          due_offset_days: 1,
          status: "open",
        },
        {
          description: "Email Kassidy confirming May 13 parser commitment delivery target",
          owner: "morgan.patel@elastic.co",
          due_offset_days: 0,
          status: "open",
        },
      ],
      commitments: [
        {
          description: "Deliver written parser commitment to Kassidy by May 13",
          committed_by: "morgan.patel@elastic.co",
          timeline: "by May 13",
        },
      ],
      customer_sentiment: {
        overall: "concerned",
        concerns: "Customer ultimatum issued; CRO budget visibility tightening.",
        champion_signals: "Tess rebuilt 18 of her top hunts in our builder this week — champion energy intact despite Devon's pressure.",
      },
      next_meeting: { offset_days: 1, agenda: "Hunt-builder demo with Devon present" },
      tags: ["security", "escalation", "internal", "splunk-replacement", "ot-scada", "executive-air-cover"],
      tech_status: "red",
      tech_status_reason:
        "Two-week delay on product parser commitment. Kassidy (CISO) gave May 14 ultimatum. Same product gate as Aurora — same week. Pattern.",
      path_to_tech_win:
        "Single critical path: written ICS/SCADA parser delivery commitment from product, in our hands by May 13.",
      next_milestone: { offset_days: 6, description: "May 13 escalation deadline for parser commitment" },
      what_changed:
        "Customer set May 14 ultimatum. Same product gate as Aurora — same week. Pattern emerging: two large red commits gated on one set of product commitments.",
      help_needed:
        "Kevin to escalate to product on ICS/SCADA parser commitment alongside Aurora's FedRAMP commitment. Same SVP, same week.",
    },
  ],

  // -------- Polaris AI Search (green upside, $225K) ---------------------
  "POLARIS-AISEARCH-2026Q3": [
    {
      daysAgo: 14,
      meeting_type: "demo",
      title: "Polaris AI Search — Demo with Knowledge Mgmt Team",
      decision_process:
        "Olu Adeyemi (KM Lead) drives the self-serve POC kit on his own timeline. Commercial trigger is end-user demand from KM users after the full-corpus run lifts recall on long-tail queries. No procurement engaged yet — this opp converts to commercial conversation only when Olu can show his leadership a measurable user-impact number.",
      summary:
        "Demoed vector search and the cross-encoder reranker pipeline against a sample of Polaris's internal knowledge-management corpus (~90K docs). Olu (KM Lead, champion) was visibly impressed by how the reranker pulled recall up on long-tail queries his team has been complaining about for over a year — users ask in their own words and his keyword-only Elasticsearch 7.x index returns top-100 by frequency, which he called 'useless.' He asked for a self-serve POC kit so he can run the same demo against the full 1.2M-doc corpus this quarter without needing Elastic SE time on every iteration. Embedding-model choice was the only open question — Olu wants confirmation on whether ELSER or a Jina model is the right default for his content shape, and Morgan committed to a side-by-side benchmark notebook in the kit.",
      key_topics: "ai-search, vector, rerank",
      decisions_made: "Send self-serve POC kit + sample notebook with side-by-side ELSER vs Jina benchmark by mid-week. Olu drives the full-corpus run on his own timeline.",
      open_questions: "For Polaris's English-only enterprise content, will ELSER outperform a Jina model on recall@10, or vice versa?",
      transcript_detail: [
        "[00:04] Olu Adeyemi (KM Lead): That long-tail relevance is exactly what my users complain about — they ask in their own words and my keyword index returns the top-100 by frequency. Useless.",
        "[00:19] Morgan Patel (Elastic SA): The reranker is the piece that fixes that on top of vector recall. I'll send a self-serve POC kit so you can run this against your full 1.2M-doc corpus without needing me on the call.",
        "[00:33] Olu Adeyemi: That works. One question — for content like ours, do I default to ELSER or a Jina model?",
        "[00:46] Morgan Patel: Default ELSER for English-only enterprise content; I'll include a side-by-side benchmark notebook in the kit so you can decide on your data.",
      ].join("\n"),
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
      decision_process:
        "Brent Holloway (VP Infra) is the decision maker; his sole criterion is cost-parity vs current self-managed run-rate. Indira Bhatt (Sr Infra, champion) walks Brent through the numbers and tells him what to sign — Brent stated this explicitly in the architecture review. Sequence: regional pricing breakdown delivered → Indira presents to Brent → Brent signs → procurement 3 weeks → commercial close.",
      summary:
        "Walked Brent and the infra team through the three serverless consolidation scenarios first scoped at the architecture review. Architecture is agreed. Brent reaffirmed his sole decision criterion: any path that beats their current self-managed run-rate at parity reliability gets his signature. The price gap is now the only remaining blocker — Brent wants a regional pricing breakdown across us-east + us-west + eu-west before he commits, with the dual-region active-passive scenario most likely to land at parity-or-below. Indira (champion) explicitly volunteered to walk Brent through the numbers when they come back: 'Get her the numbers; I'll sign on cost-parity proof.' Steve committed to delivering the regional breakdown by April 28.",
      key_topics: "serverless, cost-model, regional",
      decisions_made: "Provide regional price breakdown across us-east + us-west + eu-west by April 28. Indira walks Brent through the comparison; Brent signs on cost-parity proof.",
      open_questions: "Will the regional breakdown close the gap to their current self-managed spend, particularly for the eu-west egress component?",
      transcript_detail: [
        "[00:04] Indira Bhatt (Sr Infra, champion): I walked Brent through the three scenarios at high level. He wants the regional pricing breakdown before he commits to anything.",
        "[00:18] Brent Holloway (VP Infra): The architecture is fine. The cost question is the only one I have left. Specifically: us-east + us-west + eu-west, modeled across all three serverless options.",
        "[00:33] Steve Leung (Elastic SA): I'll have the regional breakdown by April 28. The dual-region active-passive scenario is most likely to land at parity-or-below your current self-managed run-rate.",
        "[00:48] Indira Bhatt: When the numbers come back I'll walk Brent through them; I know what to highlight to get his sign-off.",
        "[01:02] Brent Holloway: That's the right division of labor. Get her the numbers; I'll sign on cost-parity proof.",
      ].join("\n"),
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
    {
      daysAgo: 28,
      meeting_type: "technical-review",
      title: "Meridian Serverless — Multi-Region Architecture Review (Indira-led)",
      decision_process:
        "Brent Holloway (VP Infra) is the decision maker; his explicit criterion: any path that beats current self-managed run-rate at parity reliability gets his signature. Indira (champion) drives the ask and walks Brent through the comparison. Nasir (Cloud Architect) holds the technical resilience gate — egress modeling across us-east + us-west + eu-west must close his concern. Procurement is 3 weeks from Brent sign-off; total 4 weeks to commercial close.",
      summary:
        "Indira (champion) ran the architecture session walking three consolidation paths — single-region serverless, dual-region active-passive, and stay-self-managed. Brent (VP Infra) joined for the first 15 minutes to set decision criteria: any path that beats current self-managed run-rate at parity reliability. Nasir (Cloud Architect) flagged regional egress pricing across us-east + us-west + eu-west as the technical risk. Steve committed to 3-scenario regional pricing breakdown by April 28.",
      key_topics: "architecture, multi-region, datadog-replacement, decision-criteria, champion-driven",
      decisions_made:
        "Three consolidation scenarios scoped. Brent's decision criteria explicit: cost-parity vs current self-managed run-rate. Indira positioned to drive Brent's sign-off.",
      open_questions: "How does egress pricing land in us-east + eu-west across the three scenarios?",
      transcript_detail: [
        "[00:03] Indira Bhatt (Sr Infra): I want to walk you through three consolidation paths — single-region serverless, dual-region serverless with active-passive, and self-managed-stays-as-is. I've been pushing internally for option 2.",
        "[00:18] Brent Holloway (VP Infra): I'm here to hear the comparison, not to decide today. My constraint is simple: any path that beats our current self-managed run-rate at parity reliability. If serverless does that, I sign.",
        "[00:33] Nasir Aldridge (Sr Cloud Architect): My concern is regional egress. We have 5 TB/day across us-east, us-west, and eu-west. If serverless egress pricing tilts unfavorably in any single region, the math falls apart.",
        "[00:51] Steve Leung (Elastic SA): Three scenarios with regional breakdowns by April 28. Indira — if your active-passive scenario lands at parity-or-below the run-rate, what's the procurement timeline?",
        "[01:02] Indira Bhatt: Brent's signature is the gate. He signs on cost-parity proof. Procurement is 3 weeks from his sign-off — call it 4 weeks total to commercial close.",
        "[01:14] Brent Holloway: Indira knows my criteria. Get her the numbers; she'll tell me what to sign.",
      ].join("\n"),
      customers: [
        { name: "Indira Bhatt", title: "Sr Infrastructure Engineer", role_flag: "champion" },
        { name: "Brent Holloway", title: "VP Infrastructure", role_flag: "decision_maker" },
        { name: "Nasir Aldridge", title: "Sr Cloud Architect", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack: "Self-managed Elasticsearch on EC2 across 3 regions; in-house cost dashboards",
        pain_points: "Cluster ops burden; capacity planning toil across us-east + us-west + eu-west",
        requirements: "Cost parity vs self-managed run-rate; regional egress modeled across 3 regions",
        scale: "5 TB/day ingest, multi-region (us-east, us-west, eu-west)",
      },
      action_items: [
        {
          description: "Deliver 3-scenario regional pricing breakdown",
          owner: "steve.leung@elastic.co",
          due_offset_days: -24,
          status: "complete",
        },
        {
          description: "Indira to schedule Brent's sign-off review post-pricing",
          owner: customerEmail("Indira Bhatt", "meridiansystems"),
          due_offset_days: -18,
          status: "complete",
        },
        {
          description: "Validate egress pricing in us-east + eu-west specifically",
          owner: "steve.leung@elastic.co",
          due_offset_days: -22,
          status: "complete",
        },
      ],
      commitments: [
        {
          description: "3-scenario regional pricing by April 28",
          committed_by: "steve.leung@elastic.co",
          timeline: "by April 28",
        },
      ],
      customer_sentiment: {
        overall: "positive",
        champion_signals: "Indira told Brent in front of us 'I'll tell you what to sign.' Champion is locked.",
        concerns: "Regional egress pricing on us-east + eu-west is the technical risk.",
      },
      competitive_landscape: {
        incumbent: "Self-managed Elasticsearch (no external incumbent — internal alternative)",
        competitors_evaluating: ["Stay self-managed"],
        differentiators: "Multi-region active-passive without ops burden; serverless cost flex",
      },
      budget_timeline: {
        budget: "$1.1M ACV (target)",
        timeline: "4 weeks to commercial close from Brent sign-off",
        procurement: "MSA in place; SOW pending pricing proof",
        stage_signals: "negotiation; champion-driven",
      },
      next_meeting: { offset_days: -21, agenda: "3-scenario pricing review with Indira" },
      tags: ["pricing", "technical", "datadog-replacement", "exec-engagement", "champion-driven"],
      tech_status: "yellow",
      tech_status_reason:
        "Architecture agreed in principle. Decision Criteria explicit (cost-parity vs current run-rate). Champion Indira positioned to drive Brent's sign-off.",
      path_to_tech_win:
        "1) Deliver 3-scenario regional pricing breakdown by April 28. 2) Indira presents to Brent. 3) Brent signs on parity proof. 4) Procurement 3 weeks. Total: 4 weeks to close.",
      next_milestone: { offset_days: -25, description: "3-scenario pricing breakdown delivered to Indira" },
      what_changed:
        "Champion Indira ran the architecture session; Brent set explicit decision criteria (cost-parity); Nasir flagged the regional egress concern.",
    },
    {
      daysAgo: 0,
      meeting_type: "qbr",
      title: "Meridian Serverless — Pricing Lock-In & SOW Greenlight (Brent + Indira)",
      decision_process:
        "Brent (VP Infra) reviewed all three pricing scenarios, agreed to sign on dual-region active-passive at $1.1M ACV. SOW going to Meridian procurement today with a regional egress cost-cap clause Brent specifically requested. Procurement review window: 3 weeks. Phase-1 ingest live target: end of June (3 days post-signature for sandbox enablement). Nasir technically signed off after egress modeling closed his concerns.",
      summary:
        "Brent reviewed all three pricing scenarios. Dual-region active-passive at $1.1M ACV beats current self-managed run-rate by 7% in year one and 12% in year two. He's signing. SOW going to procurement today with a regional egress cost-cap clause. Phase-1 ingest live target: end of June, three days post-signature for sandbox enablement. Nasir technically signed off after egress modeling closed his concerns. Tech status flips yellow → green.",
      key_topics: "pricing-lockin, sow-greenlight, datadog-replacement, go-live, egress-cap",
      decisions_made:
        "Brent agreed to sign. SOW going to procurement today with regional egress cost-cap clause. Phase-1 ingest go-live: end of June.",
      open_questions: "Will procurement complete the SOW review within 3 weeks as Indira projected?",
      transcript_detail: [
        "[00:02] Brent Holloway (VP Infra): Indira walked me through the dual-region active-passive scenario. The numbers work. At our current ingest profile, $1.1M ACV beats our self-managed run-rate by 7% in year one and 12% in year two. I'm signing.",
        "[00:18] Indira Bhatt (Sr Infra, champion): To be clear — Brent reviewed all three scenarios. Single-region was the cheapest but failed Nasir's resilience test. Active-passive is the right architecture.",
        "[00:32] Steve Leung (Elastic SA): Thank you, Brent. We'll send the SOW to procurement today. Phase-1 ingest live target: end of June, three days post-signature for sandbox enablement.",
        "[00:46] Brent Holloway: One condition — I want the SOW to include the regional egress cost cap we discussed. If egress runs hot above the cap, we re-negotiate, not auto-bill.",
        "[00:58] Steve Leung: Confirmed — egress cap clause goes in the SOW today. I'll send the recap email this afternoon.",
        "[01:08] Nasir Aldridge: From a technical side, I'm signed off. The regional egress modeling closed out my concerns.",
      ].join("\n"),
      customers: [
        { name: "Brent Holloway", title: "VP Infrastructure", role_flag: "decision_maker" },
        { name: "Indira Bhatt", title: "Sr Infrastructure Engineer", role_flag: "champion" },
        { name: "Nasir Aldridge", title: "Sr Cloud Architect", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack: "Self-managed Elasticsearch on EC2; transitioning to Elastic Serverless dual-region active-passive",
        pain_points: "Cluster ops burden (resolving), regional egress cost predictability (resolved via cap)",
        requirements: "Phase-1 ingest live by end of June; SOW with egress cost-cap clause",
        integrations: "OTEL collector, internal cost dashboards",
        scale: "5 TB/day ingest, multi-region",
      },
      action_items: [
        {
          description: "Send SOW to Meridian procurement with egress cost-cap clause",
          owner: "steve.leung@elastic.co",
          due_offset_days: 0,
          status: "open",
        },
        {
          description: "Send recap email to Brent and Indira confirming go-live target",
          owner: "steve.leung@elastic.co",
          due_offset_days: 0,
          status: "open",
        },
        {
          description: "Schedule Phase-1 sandbox enablement call (T-3 days post-signature)",
          owner: "steve.leung@elastic.co",
          due_offset_days: 3,
          status: "open",
        },
      ],
      commitments: [
        {
          description: "SOW with egress cost-cap clause to Meridian procurement today",
          committed_by: "steve.leung@elastic.co",
          timeline: "today",
        },
        {
          description: "Phase-1 ingest live by end of June",
          committed_by: "steve.leung@elastic.co",
          timeline: "end of June",
        },
        {
          description: "Regional egress cost cap codified in contract",
          committed_by: "steve.leung@elastic.co",
          timeline: "today",
        },
      ],
      customer_sentiment: {
        overall: "positive",
        champion_signals: "Indira drove Brent's sign-off as planned. Nasir signed off technically.",
      },
      competitive_landscape: {
        incumbent: "Self-managed Elasticsearch",
        competitors_evaluating: [],
        differentiators: "Cost-parity proof + egress cap + multi-region active-passive",
      },
      budget_timeline: {
        budget: "$1.1M ACV (signed pricing)",
        timeline: "SOW today; procurement 3 weeks; Phase-1 live end of June",
        procurement: "SOW to procurement today with egress cap clause",
        stage_signals: "tech win achieved; commercial path clear",
      },
      next_meeting: { offset_days: 7, agenda: "SOW signature checkpoint with procurement" },
      tags: ["pricing", "technical", "datadog-replacement", "champion-driven", "tech-win", "go-live-imminent"],
      tech_status: "green",
      tech_status_reason:
        "Brent agreed to sign. SOW going to procurement today with egress cap clause. Phase-1 go-live end of June.",
      path_to_tech_win:
        "Achieved — pricing locked, technical sign-off, SOW going to procurement today.",
      next_milestone: { offset_days: 7, description: "SOW signature target — end of next week" },
      what_changed:
        "STATUS FLIP: yellow → green. Brent reviewed pricing, agreed to sign. SOW going to procurement today with egress cost-cap clause. Indira drove the Brent sign-off as planned.",
    },
  ],

  // -------- Stratum Observability (green upside, $575K) -----------------
  "STRATUM-OBS-2026Q3": [
    {
      daysAgo: 20,
      meeting_type: "poc",
      title: "Stratum Observability — POC Week-2 Sync",
      decision_process:
        "Naomi Weeks (SRE Manager) is treating the POC as her own team's GTM pilot — she is invested in proving it works, not just letting Elastic prove it. Week-6 readout will go to her CFO with a real cost projection. CFO approval is the procurement trigger. No external blockers; this opp is gated entirely on Naomi's internal narrative.",
      summary:
        "Week 2 of the 6-week observability POC. Naomi's team has the ingest pipeline running cleanly across all four representative services and is now self-building the priority dashboards with no Elastic-side intervention required. Naomi is treating this engagement as a pilot for her own team's go-to-market on the platform — she's invested in proving it works for them, not just letting us prove it. That changes the energy: she's going to come to the week-6 readout with her own cost projection ready, not a reaction to ours. Set the next sync as a week-4 dashboard quality review where we'll look at parity vs Datadog, latency on high-cardinality dashboards, and where the gaps are.",
      key_topics: "observability-poc, ingest, dashboards",
      decisions_made: "Continue POC through end of May. Next sync is the week-4 dashboard quality review covering Datadog parity, high-cardinality latency, and gap analysis.",
      open_questions: "How will the high-cardinality service map dashboard perform under peak-hour load (deferred to week-4 review)?",
      transcript_detail: [
        "[00:03] Naomi Weeks (SRE Manager): Ingest is solid across all four services. We're self-serving the dashboards — no need for Elastic engineering to sit on calls with us at this stage.",
        "[00:17] Jordan Kim (Elastic SA): Perfect. Let's set the next sync as a week-4 dashboard quality review — we'll look at parity vs Datadog, latency on the high-cardinality ones, and where the gaps are.",
        "[00:30] Naomi Weeks: That works. I'm treating this as a pilot for my team's GTM on the platform, not just an Elastic eval. So when we get to week-6 readout I'll have a real cost projection ready.",
      ].join("\n"),
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
    {
      daysAgo: 8,
      meeting_type: "poc",
      title: "Stratum Observability — POC Week-4 Dashboard Quality Review",
      decision_process:
        "POC week-4. Naomi is putting the 41% cost-reduction number ($740K Datadog YTD vs $440K Elastic forecast) in front of her CFO unprompted. Week-5 peak-load test is the technical gate; week-6 readout is the CFO go/no-go. CFO sign-off triggers procurement; Tomas (SRE technical evaluator) signs the technical track.",
      summary:
        "Week 4 of POC. Naomi's team has converted 18 of 22 priority dashboards (82%). Latency on the high-cardinality service map dropped from 2.3s in Datadog to 880ms here — Tomas wants peak-load verification. Naomi shared the cost projection: Datadog YTD $740K vs forecasted Elastic $440K — a 41% reduction at parity feature coverage. She's putting that number in front of her CFO unprompted.",
      key_topics: "observability-poc, datadog-replacement, dashboard-conversion, latency, metrics",
      decisions_made:
        "Run peak-load test in week 5. CFO conversation on cost savings (41% reduction) on Naomi's calendar.",
      open_questions: "Will latency parity hold under peak load on the high-cardinality service map?",
      transcript_detail: [
        "[00:04] Naomi Weeks (SRE Manager): We're at week 4. 18 of our 22 priority dashboards are converted (82%). The remaining 4 use Datadog APM custom metrics that I haven't mapped yet — those are this week.",
        "[00:18] Tomas Berryhill (SRE): Latency on the high-cardinality service map dropped from 2.3s in Datadog to 880ms here. That's a good number. I'd want to verify at peak load.",
        "[00:32] Jordan Kim (Elastic SA): We can run a load test against the peak-hour traffic profile. Let's plan that for week 5.",
        "[00:44] Naomi Weeks: One more metric for you — Datadog spend YTD is $740K. Our forecasted Elastic spend at full migration is $440K. That's a 41% reduction at parity feature coverage. I'm going to put that number in front of my CFO.",
      ].join("\n"),
      customers: [
        { name: "Naomi Weeks", title: "SRE Manager", role_flag: "champion" },
        { name: "Tomas Berryhill", title: "SRE", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack: "Datadog (logs + APM + metrics), Loki on-cluster",
        pain_points: "Datadog cost ($740K YTD); high-cardinality service map latency (2.3s)",
        requirements: "Latency parity at peak load; Datadog APM custom metrics mapping",
        integrations: "OTEL collector, kube-state-metrics",
        scale: "2 TB/day; 22 priority dashboards (18 converted)",
      },
      action_items: [
        {
          description: "Run peak-load test on high-cardinality service map",
          owner: "jordan.kim@elastic.co",
          due_offset_days: -1,
          status: "complete",
        },
        {
          description: "Map remaining 4 Datadog APM custom metrics",
          owner: customerEmail("Tomas Berryhill", "stratumnetworks"),
          due_offset_days: 0,
          status: "open",
        },
        {
          description: "CFO cost-savings review prep with 41% reduction figure",
          owner: customerEmail("Naomi Weeks", "stratumnetworks"),
          due_offset_days: 4,
          status: "open",
        },
      ],
      commitments: [
        {
          description: "Peak-load test results delivered to Naomi by week-end",
          committed_by: "jordan.kim@elastic.co",
          timeline: "by week-end",
        },
      ],
      customer_sentiment: {
        overall: "positive",
        champion_signals: "Naomi pulled 41% cost-reduction number into a CFO-ready slide unprompted.",
      },
      competitive_landscape: {
        incumbent: "Datadog",
        competitors_evaluating: ["Datadog"],
        differentiators: "Cost reduction (41%); latency parity at high cardinality",
      },
      budget_timeline: {
        budget: "$440K projected (vs $740K Datadog YTD; 41% reduction = ~$300K year-one savings)",
        timeline: "Commercial commitment week 8 (3 weeks out)",
        procurement: "TBD post-CFO review",
        stage_signals: "POC → commercial transition",
      },
      next_meeting: { offset_days: 0, agenda: "Week-5 peak-load test review" },
      tags: ["observability-poc", "datadog-replacement", "metrics", "champion-driven"],
      tech_status: "green",
      tech_status_reason:
        "Week-4 progress at 82% dashboard conversion. Latency wins documented. Cost-savings number (41%) will go to CFO.",
      path_to_tech_win:
        "1) Map remaining 4 Datadog APM custom metrics. 2) Run peak-load test in week 5. 3) CFO review of cost savings (41%). 4) Commercial commitment in week 8.",
      next_milestone: { offset_days: -1, description: "Peak-load test on high-cardinality service map" },
      what_changed:
        "Champion Naomi delivered the Metrics dimension explicitly: 82% dashboard parity, 41% cost reduction, $300K year-one savings projected. CFO conversation on the calendar.",
    },
    {
      daysAgo: 2,
      meeting_type: "qbr",
      title: "Stratum Observability — POC Week-6 Readout & Decision Criteria Review",
      decision_process:
        "POC technically complete. CFO signed off on the cost-reduction case in the readout. Decision Criteria fully captured: cost-parity, scale-trigger clause in contract, technical sign-off, procurement compliance. Commercial path now 3 weeks: Naomi presents to her VP Infra, contracts opens SOW with scale-trigger clause, procurement compliance review.",
      summary:
        "Week-6 readout with Caroline (CFO Office) joining. All 22 of 22 dashboards converted; latency parity confirmed at peak load; cost projection holding at 41% reduction ($300K year-one savings). Caroline named explicit commercial decision criteria: 24-month cost visibility, scale-trigger re-negotiation clause if ingest profile changes, Naomi's technical sign-off, procurement compliance review (~3 weeks). All achievable. Path to commercial = 3 weeks.",
      key_topics: "observability-poc, datadog-replacement, decision-criteria, commercial-path, metrics",
      decisions_made:
        "Caroline's decision criteria captured. SOW draft to include scale-trigger re-negotiation clause. Naomi technically signed off. 3-week procurement runway.",
      open_questions: "What scale threshold triggers re-negotiation in the SOW?",
      transcript_detail: [
        "[00:03] Naomi Weeks (SRE Manager): This is the week-6 readout. I'm presenting to Caroline so she can tell us what the path-to-commercial looks like.",
        "[00:14] Caroline Vega (CFO Office): Two things matter to me — total cost over 24 months, and commercial flexibility if our ingest profile changes. Naomi's slide says 41% reduction; I need that under SOW with a re-negotiation clause if we exceed projected scale.",
        "[00:31] Steve Leung (Elastic SA): Confirmed — we can include a scale-trigger re-negotiation clause. Above 3 TB/day we re-open commercial. Below, the rate stays.",
        "[00:46] Caroline Vega: Decision criteria for commercial sign-off — a) cost-parity proof with 24-month visibility, b) scale-trigger clause, c) Naomi's technical sign-off, d) procurement compliance review (~3 weeks). Hit those, we sign.",
        "[01:02] Naomi Weeks: I'm signed off technically. 22 of 22 dashboards converted. Latency parity confirmed at peak load. Cost projection holding at 41% reduction. The number that matters: $300K saved in year one.",
        "[01:18] Tomas Berryhill (SRE): Confirmed. No technical objections from me.",
      ].join("\n"),
      customers: [
        { name: "Naomi Weeks", title: "SRE Manager", role_flag: "champion" },
        { name: "Caroline Vega", title: "CFO Office Lead", role_flag: "decision_maker" },
        { name: "Tomas Berryhill", title: "SRE", role_flag: "technical_evaluator" },
      ],
      technical_environment: {
        current_stack: "Datadog (transitioning out); Elastic POC fully built",
        pain_points: "All technical pain points addressed in POC",
        requirements: "Scale-trigger re-negotiation clause; 24-month cost visibility; procurement compliance",
        scale: "2 TB/day current; 3 TB/day re-negotiation trigger threshold",
      },
      action_items: [
        {
          description: "Draft SOW with scale-trigger re-negotiation clause (>3 TB/day)",
          owner: "steve.leung@elastic.co",
          due_offset_days: 3,
          status: "open",
        },
        {
          description: "Provide 24-month cost projection to Caroline",
          owner: "steve.leung@elastic.co",
          due_offset_days: 4,
          status: "open",
        },
      ],
      commitments: [
        {
          description: "SOW draft with scale-trigger clause to Caroline by next Friday",
          committed_by: "steve.leung@elastic.co",
          timeline: "next Friday",
        },
      ],
      customer_sentiment: {
        overall: "positive",
        champion_signals: "Naomi: '22 of 22 dashboards converted... $300K saved in year one.' Tomas: 'No technical objections.'",
      },
      competitive_landscape: {
        incumbent: "Datadog",
        competitors_evaluating: [],
        differentiators: "Scale-trigger commercial flex; 41% cost reduction at parity; champion-driven adoption",
      },
      budget_timeline: {
        budget: "$575K ACV (target)",
        timeline: "3 weeks to commercial sign-off",
        procurement: "Compliance review ~3 weeks; SOW with scale-trigger clause",
        stage_signals: "POC complete; commercial path clear",
      },
      next_meeting: { offset_days: 7, agenda: "SOW review with Caroline" },
      tags: ["observability-poc", "datadog-replacement", "decision-criteria", "champion-driven", "metrics"],
      tech_status: "green",
      tech_status_reason:
        "Week-6 readout complete. CFO Office named explicit decision criteria. Champion fully signed off technically.",
      path_to_tech_win:
        "Achieved technically. Path to commercial: (a) SOW with scale-trigger clause, (b) 24-month cost visibility, (c) procurement compliance review. 3 weeks to commercial.",
      next_milestone: { offset_days: 5, description: "SOW draft with scale-trigger clause to Caroline" },
      what_changed:
        "POC technically complete. Decision Criteria fully captured: cost-parity, scale-trigger clause, technical sign-off, procurement compliance. Commercial path now 3 weeks.",
    },
  ],

  // -------- Redwood Logistics (stale, $165K, no recent meeting) ---------
  "REDWOOD-LOG-2026Q4": [
    {
      daysAgo: 62,
      meeting_type: "discovery",
      title: "Redwood Logistics Search — Initial Discovery",
      decision_process:
        "Customer absorbed in a CTO-prioritized freight-network rewrite; decision frozen until Q3 wrap. Ramona Cole (Director Eng) is entry point but reports to Greg Vandermeer (VP Eng) — Greg is a candidate for exec-level re-engagement if Ramona's track stalls. No procurement engaged. Quarterly email check-in is the cadence Ramona requested in the meantime.",
      summary:
        "Initial discovery with Ramona (Director, Engineering). The use case is real and well-scoped: their tracking-lookup endpoint sits on Solr and is seeing 800ms+ latency at peak; they need sub-200ms at 10x scale within 18 months — a textbook Elasticsearch fit. Ramona's team is small (8 engineers) and currently fully absorbed in a separate freight-network rewrite the CTO has prioritized ahead of search. She asked us to re-engage when the rewrite wraps — best estimate Q3 — but did not commit a date. Asked us specifically not to disappear; quarterly check-in over email is the right cadence. The signal we missed: Ramona was an enthusiastic-yes in this meeting and a calendar trigger should have been set then. No re-engagement booked since.",
      key_topics: "logistics-search, discovery",
      decisions_made: "Re-engage when freight rewrite project ends (estimated Q3). Maintain quarterly email check-in cadence in the meantime.",
      open_questions: "When will the freight rewrite actually conclude, and is Ramona still the right entry point or should we approach her manager?",
      transcript_detail: [
        "[00:04] Ramona Cole (Director Eng): The use case is real. Our tracking-lookup endpoint sits on Solr and we're seeing 800ms+ at peak. We need sub-200ms at 10x scale within 18 months.",
        "[00:19] Morgan Patel (Elastic SA): That's a textbook Elasticsearch fit. We can prototype it on a slice of your tracking data and show sub-100ms before the next call.",
        "[00:33] Ramona Cole: I love the energy but I have to be straight with you — my team is fully absorbed on the freight-network rewrite. The CTO put that ahead of search. We pick this back up after the rewrite — best estimate Q3.",
        "[00:46] Morgan Patel: Understood. I'll send a one-pager and we'll calendar a Q3 re-engagement. Anything else I can do in the meantime?",
        "[00:58] Ramona Cole: Honestly, just don't disappear on us. Quarterly check-in over email is the right cadence.",
      ].join("\n"),
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
    {
      daysAgo: 3,
      meeting_type: "internal",
      title: "Redwood Logistics Search — Internal Re-Engagement Attempt Log",
      decision_process:
        "Final attempt before close-lost: Nina (AE) does an exec-level outreach to Greg Vandermeer (VP Engineering, Ramona's manager) by mid-May. If Greg responds, we restart at the exec level and reset cadence. If silent, we downgrade to closed-lost-to-internal-priorities and set a Q3 calendar reminder for re-discovery once the freight rewrite wraps.",
      summary:
        "Morgan documenting a chain of failed outreach attempts since March 12. Email April 3 — no reply. Phone April 18 — voicemail, no return. LinkedIn April 30 — read, no reply. Public Redwood blog (April 25) confirms freight-network rewrite is 'on track for Q3 completion' — customer is absorbed in their internal priority. Recommendation: park until Q3, but Nina (AE) to attempt one final exec-level outreach to Greg Vandermeer (VP Engineering, Ramona's manager) by mid-May. If no response, downgrade pipeline → closed-lost-to-internal-priorities.",
      key_topics: "stalled, hygiene-gap, exec-outreach, closed-lost-risk",
      decisions_made:
        "Three failed outreach attempts logged. Nina to attempt exec-level outreach by mid-May. Q3 calendar reminder set if exec outreach silent.",
      open_questions: "Will Greg Vandermeer respond to a fresh exec-level approach?",
      transcript_detail: [
        "[00:02] Morgan Patel (SE): Three outreach attempts since March 12. Email April 3 — no reply. Phone April 18 — voicemail, no return. LinkedIn April 30 — read, no reply.",
        "[00:14] Morgan Patel: Last verified status: their freight-network rewrite project is still active and consuming Ramona's full attention. Per a public Redwood blog post April 25, the rewrite is 'on track for Q3 completion.'",
        "[00:28] Morgan Patel: Recommendation: park until Q3 with a calendar reminder for July 15. AE (Nina) to make one follow-up attempt at executive level — Greg Vandermeer (VP Engineering, Ramona's manager) — by mid-May. If no response, deal is downgraded from pipeline to closed-lost-to-internal-priorities.",
      ].join("\n"),
      customers: [],
      technical_environment: {
        current_stack: "n/a (internal)",
        pain_points: "Customer absorbed in internal freight-network rewrite",
        requirements: "Exec-level outreach attempt before close-lost decision",
      },
      action_items: [
        {
          description: "AE exec outreach to Greg Vandermeer (VP Engineering, Ramona's manager)",
          owner: "nina.ortega@elastic.co",
          due_offset_days: 8,
          status: "open",
        },
        {
          description: "Set Q3 calendar reminder if exec outreach goes silent",
          owner: "morgan.patel@elastic.co",
          due_offset_days: 10,
          status: "open",
        },
      ],
      commitments: [],
      customer_sentiment: {
        overall: "neutral",
        concerns: "Customer non-responsive across 3 channels in 8 weeks.",
      },
      next_meeting: { offset_days: 8, agenda: "Nina exec outreach attempt to Greg Vandermeer" },
      tags: ["internal", "stalled", "hygiene-gap", "closed-lost-risk"],
      tech_status: "yellow",
      tech_status_reason:
        "Three failed outreach attempts since March. Customer absorbed in internal freight-network rewrite. Re-engagement attempt at exec level is the last play before closed-lost.",
      path_to_tech_win:
        "1) Nina (AE) to attempt exec outreach to Greg Vandermeer by mid-May. 2) If no response, downgrade to closed-lost. 3) Otherwise, park until Q3 freight-rewrite completion.",
      next_milestone: { offset_days: 8, description: "Nina exec outreach to Greg Vandermeer; final attempt before close-lost" },
      what_changed:
        "Three failed outreach attempts logged. Last verified customer status confirmed via public blog post. Final exec-level outreach plan in place.",
      help_needed:
        "Need Nina (AE) to commit to exec outreach within 8 days or we should formally close-lost.",
    },
  ],

  // -------- Nimbus AI Search (green upside, $260K) ----------------------
  "NIMBUS-AISEARCH-2026Q2": [
    {
      daysAgo: 15,
      meeting_type: "demo",
      title: "Nimbus AI Search Pilot — Discovery + Demo",
      decision_process:
        "Marisol Day (Head of Product) sets the pace; her explicit success criterion is recall@10 lift on a labeled long-tail query sample vs current Postgres FTS. 8-week decision window: 4-week pilot + 2-week shadow-mode launch + 2-week ramp. Quinn Tabor (Sr Eng) is the technical evaluator and would happily exit the in-house embedding maintenance burden. No procurement engaged until pilot results land.",
      summary:
        "First call with Nimbus, a net-new logo (B2C product company, ~600 employees). Marisol (Head of Product) drove the agenda; Quinn (Sr Engineer) was the technical evaluator. Their current stack is Postgres full-text plus a custom embedding service that has been a maintenance burden for Quinn's team for two years — Quinn explicitly said he would 'happily get out of that business.' Demoed vector + cross-encoder reranking against a public Wikipedia slice. Marisol asked, on her own initiative, what 'time to first results in production' looks like — that is a buy-signal we don't typically get on a first call. Pilot scoping kicked off: 4-week pilot, 2-week shadow-mode launch with feature flag, 2-week ramp. Success criterion is recall@10 lift on a labeled sample of long-tail queries vs current Postgres FTS.",
      key_topics: "vector, rerank, net-new",
      decisions_made: "Scope a 4-week pilot with shadow-mode launch + 2-week ramp. Send pilot scope draft this week. Success criterion: recall@10 lift on a labeled long-tail query sample vs current Postgres FTS.",
      open_questions: "Do they have a labeled relevance dataset we can use, or do we need to seed one for the pilot eval?",
      transcript_detail: [
        "[00:03] Marisol Day (Head of Product): Recall on our long-tail queries is the user-experience bug I get the most complaints about. Our embedding service is two years old and Quinn's team can't keep up with it.",
        "[00:18] Quinn Tabor (Sr Eng): That's accurate. I've been running our own embeddings on a single GPU since 2024. I'd happily get out of that business.",
        "[00:32] Steve Leung (Elastic SA): The pilot would put a hybrid retrieval + cross-encoder reranker in front of your Postgres index without removing it. Success criterion would be recall@10 lift on a labeled sample of long-tail queries.",
        "[00:47] Marisol Day: What does 'time to first results in production' look like? I want to make sure we can ship something measurable in a quarter, not get stuck in eval purgatory.",
        "[01:00] Steve Leung: 4-week pilot, 2-week shadow-mode launch with feature flag, 2-week ramp. That's the typical path. I'll send a pilot scope draft this week.",
      ].join("\n"),
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
