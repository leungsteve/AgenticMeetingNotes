/**
 * Split Granola "Account Meeting" template markdown into ## sections (H2 only).
 */
function splitH2Sections(markdown: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!markdown?.trim()) return map;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let currentTitle: string | null = null;
  const currentLines: string[] = [];
  const flush = () => {
    if (currentTitle) {
      const body = currentLines.join("\n").trim();
      map.set(currentTitle.toLowerCase(), body);
    }
    currentLines.length = 0;
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      flush();
      currentTitle = m[1].trim();
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }
  flush();
  return map;
}

function section(sections: Map<string, string>, ...titles: string[]): string | null {
  for (const t of titles) {
    const v = sections.get(t.toLowerCase());
    if (v?.trim()) return v;
  }
  return null;
}

/** Parse `- **Label:** value` style lines (also `* **Label:**`). */
function parseLabeledLines(block: string | null): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!block) return out;
  const re = /^[*-]\s*\*\*([^*]+?)\*\*:\s*(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const key = m[1].trim().toLowerCase().replace(/\s+/g, "_");
    const val = m[2].trim();
    out[key] = val.length ? val : null;
  }
  return out;
}

/** Best-effort structured parse for the Enrich panel (nulls when missing). */
export function parseGranolaSummaryMarkdown(summaryMarkdown: string | null | undefined): {
  attendees_raw: string | null;
  meeting_context_raw: string | null;
  meeting_summary_raw: string | null;
  key_topics: string | null;
  decisions_made: string | null;
  action_items_raw: string | null;
  commitments_raw: string | null;
  technical_environment: {
    current_stack: string | null;
    pain_points: string | null;
    requirements: string | null;
    scale: string | null;
    integrations: string | null;
    constraints: string | null;
  } | null;
  customer_sentiment: {
    overall: string | null;
    concerns: string | null;
    objections: string | null;
    champion_signals: string | null;
  } | null;
  competitive_landscape: {
    incumbent: string | null;
    competitors_evaluating: string | null;
    mentions: string | null;
    differentiators: string | null;
  } | null;
  budget_timeline: {
    budget: string | null;
    timeline: string | null;
    procurement: string | null;
    stage_signals: string | null;
  } | null;
  demo_poc_request_raw: string | null;
  resources_raw: string | null;
  next_steps_raw: string | null;
  open_questions: string | null;
} {
  const s = splitH2Sections(summaryMarkdown);

  const techBlock = section(
    s,
    "Technical Environment & Requirements",
    "Technical Environment",
  );
  const techL = parseLabeledLines(techBlock);
  const technical_environment =
    techBlock && Object.keys(techL).length
      ? {
          current_stack: techL.current_stack ?? null,
          pain_points: techL.pain_points ?? null,
          requirements: techL.requirements ?? null,
          scale: techL.scale ?? null,
          integrations: techL.integrations ?? null,
          constraints: techL.constraints ?? null,
        }
      : techBlock?.trim()
        ? {
            current_stack: null,
            pain_points: null,
            requirements: null,
            scale: null,
            integrations: null,
            constraints: null,
          }
        : null;

  const sentBlock = section(s, "Customer Sentiment & Objections", "Customer Sentiment");
  const sentL = parseLabeledLines(sentBlock);
  const customer_sentiment = sentBlock
    ? {
        overall: sentL.overall_sentiment ?? sentL.overall ?? null,
        concerns: sentL.specific_concerns ?? sentL.concerns ?? null,
        objections: sentL.objections ?? null,
        champion_signals: sentL.champion_signals ?? null,
      }
    : null;

  const compBlock = section(s, "Competitive Landscape");
  const compL = parseLabeledLines(compBlock);
  const competitive_landscape = compBlock
    ? {
        incumbent: compL["incumbent_/_current_solution"] ?? compL.incumbent ?? null,
        competitors_evaluating: compL["competitors_evaluating"] ?? null,
        mentions: compL["competitive_mentions"] ?? compL.mentions ?? null,
        differentiators: compL["our_differentiators_discussed"] ?? compL.differentiators ?? null,
      }
    : null;

  const budBlock = section(s, "Budget, Timeline & Procurement");
  const budL = parseLabeledLines(budBlock);
  const budget_timeline = budBlock
    ? {
        budget: budL.budget ?? null,
        timeline: budL.timeline ?? null,
        procurement: budL.procurement_process ?? budL.procurement ?? null,
        stage_signals: budL["deal_stage_signals"] ?? budL.stage_signals ?? null,
      }
    : null;

  return {
    attendees_raw: section(s, "Attendees"),
    meeting_context_raw: section(s, "Meeting Context"),
    meeting_summary_raw: section(s, "Meeting Summary", "Discussion Summary"),
    key_topics: section(s, "Key Topics Discussed", "Key Topics"),
    decisions_made: section(s, "Decisions Made"),
    action_items_raw: section(s, "Action Items"),
    commitments_raw: section(s, "Commitments Made"),
    technical_environment,
    customer_sentiment,
    competitive_landscape,
    budget_timeline,
    demo_poc_request_raw: section(s, "Demo / POC Requests", "Demo / POC Request"),
    resources_raw: section(s, "Resources Shared or Requested", "Resources"),
    next_steps_raw: section(s, "Next Steps", "Next Internal Sync"),
    open_questions: section(s, "Open Questions"),
  };
}
