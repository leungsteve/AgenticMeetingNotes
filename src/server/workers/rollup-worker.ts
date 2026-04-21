import { elasticService } from "../elastic-instance.js";

export async function computeRollup(account: string): Promise<void> {
  // 1. Fetch all notes for this account
  const { notes } = await elasticService.searchIngestedNotes({ account, size: 1000 });

  if (!notes.length) return;

  // 2. Compute metrics
  const meetingCount = notes.length;
  const dates = notes.map((n) => n.meeting_date as string).filter(Boolean).sort();
  const lastMeetingDate = dates[dates.length - 1];
  const firstMeetingDate = dates[0];

  // Sentiment counts
  const sentimentCounts: Record<string, number> = {};
  let latestSentiment: string | undefined;
  let latestDate = "";

  for (const note of notes) {
    const s = (note.customer_sentiment as Record<string, unknown> | undefined)?.overall as
      | string
      | undefined;
    if (s) {
      sentimentCounts[s] = (sentimentCounts[s] ?? 0) + 1;
      const noteDate = (note.meeting_date as string) ?? "";
      if (noteDate > latestDate) {
        latestDate = noteDate;
        latestSentiment = s;
      }
    }
  }

  // Competitors seen
  const competitorsSet = new Set<string>();
  for (const note of notes) {
    const cl = note.competitive_landscape as Record<string, unknown> | undefined;
    const ce = cl?.competitors_evaluating;
    if (Array.isArray(ce)) {
      for (const c of ce) {
        if (typeof c === "string") competitorsSet.add(c);
      }
    }
  }

  // Meeting types seen
  const meetingTypesSet = new Set<string>();
  for (const note of notes) {
    const mt = note.meeting_type as string | undefined;
    if (mt) meetingTypesSet.add(mt);
  }

  // Authors
  const authorsSet = new Set<string>();
  for (const note of notes) {
    const ae = note.author_email as string | undefined;
    if (ae) authorsSet.add(ae);
  }

  // Tags frequency
  const tagsFrequency: Record<string, number> = {};
  for (const note of notes) {
    const tags = note.tags as string[] | undefined;
    if (Array.isArray(tags)) {
      for (const t of tags) tagsFrequency[t] = (tagsFrequency[t] ?? 0) + 1;
    }
  }

  // Open / overdue action items — query action-items index
  const openItems = await elasticService.listActionItems({ account, status: "open", size: 1000 });
  const now = new Date();
  const overdueItems = openItems.filter((item) => {
    const dd = item.due_date as string | undefined;
    return dd && new Date(dd) < now;
  });

  // Momentum score: simple heuristic
  // +1 per meeting in last 30 days, +2 for enthusiastic/positive, -1 for concerned/skeptical, -0.5 per overdue item
  let momentum = 0;
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const note of notes) {
    if ((note.meeting_date as string) >= thirtyDaysAgo) momentum += 1;
    const s = (note.customer_sentiment as Record<string, unknown> | undefined)?.overall as
      | string
      | undefined;
    if (s === "enthusiastic") momentum += 2;
    else if (s === "positive") momentum += 1;
    else if (s === "concerned") momentum -= 1;
    else if (s === "skeptical") momentum -= 1;
  }
  momentum -= overdueItems.length * 0.5;

  await elasticService.upsertAccountRollup(account, {
    account,
    meeting_count: meetingCount,
    last_meeting_date: lastMeetingDate,
    first_meeting_date: firstMeetingDate,
    open_action_items: openItems.length,
    overdue_action_items: overdueItems.length,
    competitors_seen: [...competitorsSet],
    sentiment_counts: sentimentCounts,
    latest_sentiment: latestSentiment,
    tags_frequency: tagsFrequency,
    meeting_types: [...meetingTypesSet],
    authors: [...authorsSet],
    momentum_score: Math.round(momentum * 10) / 10,
    computed_at: new Date().toISOString(),
  });
}

export async function computeAllRollups(): Promise<void> {
  // Get all distinct accounts from notes
  const teams = await elasticService.listPursuitTeams();
  const accounts = teams.map((t) => t.account as string).filter(Boolean);

  // Also get accounts from notes themselves (in case not in pursuit team yet)
  const { notes } = await elasticService.searchIngestedNotes({ size: 1000 });
  const noteAccounts = new Set(notes.map((n) => n.account as string).filter(Boolean));
  const accountSet = new Set([...accounts, ...noteAccounts]);

  for (const account of accountSet) {
    try {
      await computeRollup(account);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[rollup-worker] Failed for account "${account}":`, err);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[rollup-worker] Computed ${accountSet.size} rollups at ${new Date().toISOString()}`);
}

// Also denormalize action items from a note into the action-items index
export async function denormalizeActionItems(note: {
  note_id: string;
  account?: string;
  meeting_date?: string;
  title?: string;
  action_items?: Array<{
    description?: string | null;
    owner?: string | null;
    due_date?: string | null;
    status?: string | null;
  }>;
}): Promise<void> {
  if (!note.action_items?.length) return;
  const items: Array<{ id: string; doc: Record<string, unknown> }> = [];
  for (const item of note.action_items) {
    const description = String(item.description ?? "").trim();
    const owner = String(item.owner ?? "").trim();
    if (!description || !owner) continue;
    items.push({
      id: `${note.note_id}_${Buffer.from(description).toString("base64").slice(0, 12)}`,
      doc: {
        source_note_id: note.note_id,
        account: note.account,
        meeting_date: note.meeting_date,
        meeting_title: note.title,
        description,
        owner,
        due_date: item.due_date ?? undefined,
        status: item.status?.trim() || "open",
        ingested_at: new Date().toISOString(),
      },
    });
  }
  if (!items.length) return;
  await elasticService.bulkUpsertActionItems(items);
}
