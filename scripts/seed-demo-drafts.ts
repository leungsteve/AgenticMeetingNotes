/**
 * seed-demo-drafts
 *
 * Seeds realistic email drafts into the `email-drafts` index so the
 * Inbox → Drafts tab is populated after `npm run demo:all`.
 *
 * Drafts are keyed by deterministic IDs so re-runs are idempotent.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { errors } from "@elastic/elasticsearch";
import { ElasticService } from "../src/server/services/elastic.js";
import type { EmailDraftDocument } from "../src/server/services/elastic.js";

function draftId(slug: string): string {
  return createHash("sha256").update(`demo-draft:${slug}`).digest("hex").slice(0, 36);
}

function isoAgo(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
}

const DEMO_DRAFTS: EmailDraftDocument[] = [
  {
    draft_id: draftId("aurora-health-poc-recap"),
    note_id: createHash("sha256").update("demo:aurora-health-2025-q2:poc").digest("hex").slice(0, 24),
    account: "Aurora Health Systems",
    opportunity_id: "aurora-health-2025-q2",
    owner: "steve.leung@elastic.co",
    subject: "Aurora Health — Security Analytics POC Recap & Next Steps",
    body: `Hi Sarah,

Thank you for taking the time today to walk through the POC results with the Aurora Health team. Here is a quick recap of where we landed and our agreed next steps:

**POC Summary**
The Elasticsearch Security Analytics deployment achieved sub-second query latency on your 2 TB/day ingestion volume, with OOTB threat detection covering 94% of the MITRE ATT&CK scenarios we scoped. The SIEM migration path from Splunk is clear.

**Next Steps**
1. We will deliver the final sizing and pricing proposal by end of this week.
2. I will coordinate an executive sponsor call between our VP of Pre-Sales and your CISO to address the data residency requirement.
3. Please send over the procurement timeline so we can align on Q2 close.

Looking forward to moving this forward — we're confident Elastic is the right fit for Aurora's security platform.

Best,
Steve`,
    recipient_hint: "sarah.chen@aurorahealth.example",
    draft_type: "customer_recap",
    status: "pending",
    source_note_title: "Aurora Health Systems · Aurora Security Analytics POC Review",
    created_at: isoAgo(2),
    updated_at: isoAgo(2),
  },
  {
    draft_id: draftId("meridian-pricing-followup"),
    note_id: createHash("sha256").update("demo:meridian-systems-2025-q2:techreview").digest("hex").slice(0, 24),
    account: "Meridian Systems",
    opportunity_id: "meridian-systems-2025-q2",
    owner: "steve.leung@elastic.co",
    subject: "Meridian Systems — Cost Model & Consolidation Scenarios",
    body: `Hi Alex,

Following our architecture review today, I wanted to send over the key takeaways before our follow-up call next week.

**What we aligned on**
- Consolidating Splunk + Sumo Logic onto Elastic Observability + Security closes the tooling sprawl and reduces your per-GB cost by approximately 40% at your current ingestion volume.
- The serverless pricing model fits your variable log volume — no need to overprovision for peak.

**What I'm preparing for you**
- Three consolidation scenarios with regional pricing breakdowns (I'll have this to you by Thursday).
- A serverless cost model spreadsheet you can share with your CFO.

Let me know if anything shifts on your end before Thursday.

Best,
Steve`,
    recipient_hint: "alex.wong@meridiansystems.example",
    draft_type: "customer_recap",
    status: "pending",
    source_note_title: "Meridian Systems · Architecture Review — Consolidation Scenarios",
    created_at: isoAgo(5),
    updated_at: isoAgo(5),
  },
  {
    draft_id: draftId("helix-robotics-internal"),
    note_id: createHash("sha256").update("demo:helix-robotics-platform-2025-q2:poc").digest("hex").slice(0, 24),
    account: "Helix Robotics",
    opportunity_id: "helix-robotics-platform-2025-q2",
    owner: "steve.leung@elastic.co",
    subject: "INTERNAL: Helix Robotics — Escalation Needed on POC Blockers",
    body: `Ed / Team,

Quick internal note from today's Helix Robotics POC sync — flagging this for escalation before the Monday leadership review.

**Status: Red**
The POC is blocked on two items:
1. **Data residency** — Helix legal will not approve EU data leaving EU boundaries. Their current cloud config routes logs through US-EAST. We need a solution architect from the Geo team to review their deployment topology.
2. **Splunk contract** — Their Splunk renewal is in 6 weeks. If we can't resolve #1 by then, they renew Splunk.

**Ask of leadership**
- Can we get a Geo specialist on a call this week or early next?
- Is there any commercial flexibility on multi-region pricing for deals this size ($1.2M ACV)?

I'll loop in Priya (AE) to coordinate timing.

Steve`,
    recipient_hint: "ed.salazar@elastic.co",
    draft_type: "internal_followup",
    status: "pending",
    source_note_title: "Helix Robotics · Platform Observability POC Sync",
    created_at: isoAgo(1),
    updated_at: isoAgo(1),
  },
  {
    draft_id: draftId("polaris-energy-discovery"),
    note_id: createHash("sha256").update("demo:polaris-energy-siem-2025-q2:discovery").digest("hex").slice(0, 24),
    account: "Polaris Energy",
    opportunity_id: "polaris-energy-siem-2025-q2",
    owner: "steve.leung@elastic.co",
    subject: "Polaris Energy — Discovery Call Recap",
    body: `Hi Marcus,

Great discovery call with the Polaris team today. Here's the summary for your CRM notes and a quick follow-up for the customer.

**Customer context**
Polaris is running Microsoft Sentinel for SIEM today. Their primary pain is alert fatigue — the SOC team is processing 1,200+ alerts/day with an average 4-hour MTTR. They want to get MTTR under 30 minutes within 12 months.

**Elastic fit**
Strong match: Elastic SIEM's correlation rules + ML-based anomaly detection directly addresses their MTTR problem. Competitive against Sentinel on total cost at their data volume (estimated 500 GB/day).

**Agreed next steps**
- We'll send a custom threat-detection demo tailored to OT/ICS environments (their specific ask).
- They'll share a sample of their current Sentinel alert taxonomy so we can map it to Elastic detection rules.

Let me know if you want to loop in a SIEM specialist for the follow-up session.

Steve`,
    recipient_hint: "jordan.reyes@polarisenergy.example",
    draft_type: "customer_recap",
    status: "pending",
    source_note_title: "Polaris Energy · SIEM Discovery Call",
    created_at: isoAgo(8),
    updated_at: isoAgo(8),
  },
  {
    draft_id: draftId("aurora-health-approved"),
    note_id: createHash("sha256").update("demo:aurora-health-2025-q2:discovery").digest("hex").slice(0, 24),
    account: "Aurora Health Systems",
    opportunity_id: "aurora-health-2025-q2",
    owner: "steve.leung@elastic.co",
    subject: "Aurora Health — Initial Discovery Follow-Up",
    body: `Hi Sarah,

Thanks for the time last week — really productive first call. Sending the architecture overview deck and the HIPAA compliance brief as promised.

The key thing I want you to take away is that Elastic's data-at-rest encryption, audit logging, and role-based access control are all HIPAA-ready out of the box — no additional modules required.

Happy to jump on a quick call to walk through the compliance section with your security team. Just say the word.

Steve`,
    recipient_hint: "sarah.chen@aurorahealth.example",
    draft_type: "customer_recap",
    status: "approved",
    source_note_title: "Aurora Health Systems · Initial Discovery",
    created_at: isoAgo(48),
    updated_at: isoAgo(36),
  },
];

async function main(): Promise<void> {
  if (!process.env.ELASTIC_CLOUD_ID?.trim() || !process.env.ELASTIC_API_KEY?.trim()) {
    console.error("Missing ELASTIC_CLOUD_ID or ELASTIC_API_KEY.");
    process.exit(1);
  }

  const elastic = new ElasticService();

  try {
    await elastic.ping();
  } catch (err) {
    console.error("Could not reach Elasticsearch.");
    if (err instanceof errors.ResponseError) console.error(err.message);
    process.exit(1);
  }

  let created = 0;
  for (const draft of DEMO_DRAFTS) {
    try {
      await elastic.createEmailDraft(draft);
      console.log(`  ✓ ${draft.account} — "${draft.subject.slice(0, 60)}"`);
      created++;
    } catch (e) {
      console.error(`  ✗ ${draft.draft_id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\n--- Demo drafts seed complete: ${created} draft(s) ---\n`);
  console.log("  → Open http://localhost:5173 → Inbox → Drafts to see them.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
