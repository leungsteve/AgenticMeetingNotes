import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EnrichPanel, { type LookupsBundle } from "../components/EnrichPanel.js";
import IngestProgress from "../components/IngestProgress.js";
import NotePreview from "../components/NotePreview.js";
import { fetchIngestedNote, useIngestedSearch } from "../hooks/useElasticSearch.js";
import { fetchNoteDetail, useGranolaNotesList } from "../hooks/useGranolaNotes.js";
import { useIngest } from "../hooks/useIngest.js";
import { buildFormFromElasticDoc, buildFormFromNoteDetail } from "../lib/build-enrichment-form.js";
import { getJson, postJson } from "../lib/api.js";
import { clearDraft, getSessionUserEmail, loadDraft, saveDraft, setSessionUserEmail } from "../lib/session.js";
import type {
  EnrichmentForm,
  GranolaListRow,
  IngestResponse,
  IngestRowResult,
  LookupRow,
  NoteDetailResponse,
  OpportunityRow,
  TeamMemberRow,
} from "../types/index.js";
import { emptyEnrichmentForm } from "../types/index.js";

function meetingDateIso(d: NoteDetailResponse): string {
  const cal = d.calendar_event as { scheduled_start_time?: string } | null | undefined;
  if (cal?.scheduled_start_time) return cal.scheduled_start_time;
  return d.created_at;
}

export default function MyNotes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"granola" | "elastic">("granola");
  const [team, setTeam] = useState<TeamMemberRow[]>([]);
  const [listUser, setListUser] = useState<string | null>(getSessionUserEmail);
  const [fromDate, setFromDate] = useState("");
  const [showIngested, setShowIngested] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NoteDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form, setForm] = useState<EnrichmentForm>(emptyEnrichmentForm());
  const [ingestResults, setIngestResults] = useState<IngestRowResult[] | null>(null);
  const { ingest, loading: ingesting } = useIngest();
  const { search: searchElastic, data: elasticData, loading: elasticLoading, error: elasticError } =
    useIngestedSearch();

  const [efilters, setEfilters] = useState({
    account: "",
    opportunity: "",
    meeting_type: "",
    tags: "",
    q: "",
    page: "1",
    size: "25",
  });

  const createdAfter = fromDate ? `${fromDate}T00:00:00.000Z` : undefined;
  const { data: granolaRows, loading: gLoading, error: gError, refetch: refetchGranola } =
    useGranolaNotesList(listUser, createdAfter);

  const filteredGranola = useMemo(() => {
    if (!granolaRows) return [];
    if (showIngested) return granolaRows;
    return granolaRows.filter((r) => !r.already_ingested);
  }, [granolaRows, showIngested]);

  const loadTeam = useCallback(async () => {
    const rows = await getJson<TeamMemberRow[]>("/api/team-members");
    setTeam(rows);
    const session = getSessionUserEmail();
    if (session && rows.some((r) => r.user_email === session)) {
      setListUser(session);
    } else if (rows[0]) {
      setListUser(rows[0].user_email);
      setSessionUserEmail(rows[0].user_email);
    }
  }, []);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    if (tab !== "elastic") return;
    void searchElastic({
      account: efilters.account || undefined,
      opportunity: efilters.opportunity || undefined,
      meeting_type: efilters.meeting_type || undefined,
      tags: efilters.tags || undefined,
      q: efilters.q || undefined,
      page: efilters.page,
      size: efilters.size,
    });
  }, [
    tab,
    searchElastic,
    efilters.account,
    efilters.opportunity,
    efilters.meeting_type,
    efilters.tags,
    efilters.q,
    efilters.page,
    efilters.size,
  ]);

  const [lookups, setLookups] = useState<LookupsBundle>({
    accounts: [],
    opportunities: [],
    meetingTypes: [],
    tags: [],
    salesStages: [],
    teamEmails: [],
    opportunityRows: [],
  });

  const reloadLookups = useCallback(async () => {
    const [accounts, opportunities, meetingTypes, tags, salesStages] = await Promise.all([
      getJson<LookupRow[]>("/api/lookups?type=account"),
      getJson<LookupRow[]>("/api/lookups?type=opportunity"),
      getJson<LookupRow[]>("/api/lookups?type=meeting_type"),
      getJson<LookupRow[]>("/api/lookups?type=tag"),
      getJson<LookupRow[]>("/api/lookups?type=sales_stage"),
    ]);
    const members = await getJson<TeamMemberRow[]>("/api/team-members");
    let opportunityRows: OpportunityRow[] = [];
    try {
      const oppResp = await getJson<{ opportunities: OpportunityRow[] }>("/api/opportunities");
      opportunityRows = Array.isArray(oppResp.opportunities) ? oppResp.opportunities : [];
    } catch {
      opportunityRows = [];
    }
    setLookups({
      accounts,
      opportunities,
      meetingTypes,
      tags,
      salesStages,
      teamEmails: members.map((m) => m.user_email),
      opportunityRows,
    });
  }, []);

  useEffect(() => {
    void reloadLookups();
  }, [reloadLookups]);

  const loadDetailGranola = useCallback(
    async (id: string) => {
      if (!listUser) return;
      setDetailLoading(true);
      try {
        const d = await fetchNoteDetail(id, listUser);
        setDetail(d);
        const draft = loadDraft<Partial<EnrichmentForm>>(id);
        setForm(buildFormFromNoteDetail(d, draft));
      } finally {
        setDetailLoading(false);
      }
    },
    [listUser],
  );

  const loadDetailElastic = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const doc = await fetchIngestedNote(id);
      setForm(buildFormFromElasticDoc(doc));
      const fakeDetail: NoteDetailResponse = {
        id: String(doc.note_id ?? id),
        title: doc.title == null ? null : String(doc.title),
        created_at: String(doc.meeting_date ?? ""),
        updated_at: String(doc.updated_at ?? ""),
        owner: {
          name: doc.author_name == null ? null : String(doc.author_name),
          email: String(doc.author_email ?? ""),
        },
        calendar_event: null,
        attendees: Array.isArray(doc.attendees)
          ? (doc.attendees as { name?: string; email?: string }[]).map((a) => ({
              name: a.name ?? null,
              email: String(a.email ?? ""),
            }))
          : [],
        summary_text: String(doc.summary ?? ""),
        summary_markdown: null,
        transcript: doc.transcript == null ? null : String(doc.transcript),
        suggested_tags: [],
        elastic_metadata: doc as NoteDetailResponse["elastic_metadata"],
      };
      setDetail(fakeDetail);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const note = searchParams.get("note");
    const u = searchParams.get("user_email");
    if (u) {
      setSessionUserEmail(u);
      setListUser(u.trim().toLowerCase());
    }
    if (note) {
      setTab("elastic");
      setActiveId(note);
      void loadDetailElastic(note);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, loadDetailElastic]);

  useEffect(() => {
    if (!activeId || tab !== "granola" || !listUser) return;
    void loadDetailGranola(activeId);
  }, [activeId, tab, listUser, loadDetailGranola]);

  const suggestedTags = detail?.suggested_tags ?? [];

  const elasticBanner = useMemo(() => {
    const em = detail?.elastic_metadata as Record<string, unknown> | null | undefined;
    if (!em?.ingested_at) return null;
    return {
      ingested_at: String(em.ingested_at),
      ingested_by: em.ingested_by == null ? undefined : String(em.ingested_by),
      version: em.version == null ? undefined : Number(em.version),
    };
  }, [detail]);

  const onAddLookup = async (row: { type: string; value: string; label: string }) => {
    await postJson("/api/lookups", row);
    await reloadLookups();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const ingestLabel = useMemo(() => {
    const ids = [...selected];
    if (!ids.length) return "Ingest Selected";
    const rows = granolaRows?.filter((r) => ids.includes(r.id)) ?? [];
    const allIn = rows.length && rows.every((r) => r.already_ingested);
    const noneIn = rows.length && rows.every((r) => !r.already_ingested);
    if (allIn) return "Update Selected";
    if (noneIn) return "Ingest Selected";
    return "Ingest & Update";
  }, [selected, granolaRows]);

  const runIngest = async () => {
    if (!listUser) return;
    const member = team.find((t) => t.user_email === listUser);
    if (!member) return;
    const ids = [...selected];
    if (!ids.length) return;
    setIngestResults(null);
    const notesPayload: unknown[] = [];
    for (const id of ids) {
      let d = id === activeId && detail && detail.id === id ? detail : null;
      if (!d && tab === "granola") {
        d = await fetchNoteDetail(id, listUser);
      } else if (!d && tab === "elastic") {
        const doc = await fetchIngestedNote(id);
        d = {
          id: String(doc.note_id ?? id),
          title: doc.title == null ? null : String(doc.title),
          created_at: String(doc.meeting_date ?? ""),
          updated_at: String(doc.updated_at ?? ""),
          owner: {
            name: doc.author_name == null ? null : String(doc.author_name),
            email: String(doc.author_email ?? ""),
          },
          attendees: [],
          summary_text: String(doc.summary ?? ""),
          summary_markdown: null,
          transcript: doc.transcript == null ? null : String(doc.transcript),
          suggested_tags: [],
        } as NoteDetailResponse;
      }
      if (!d) continue;
      notesPayload.push({
        granola_note_id: d.id,
        title: d.title,
        summary: d.summary_text,
        transcript: d.transcript,
        meeting_date: meetingDateIso(d),
        author_email: member.user_email,
        author_name: member.user_name ?? member.user_email,
        author_role: member.user_role ?? "SA",
        account: form.account.trim() || "unassigned",
        opportunity: form.opportunity || undefined,
        meeting_type: form.meeting_type || undefined,
        sales_stage: form.sales_stage || undefined,
        meeting_purpose: form.meeting_purpose || undefined,
        scheduled_by: form.scheduled_by || undefined,
        tags: form.tags,
        attendees: form.attendees.filter((a) => a.email?.trim()),
        action_items: form.action_items.filter((a) => a.description?.trim()),
        commitments: form.commitments.filter((c) => c.description?.trim()),
        technical_environment: form.technical_environment,
        customer_sentiment: form.customer_sentiment,
        competitive_landscape: {
          ...form.competitive_landscape,
          competitors_evaluating: form.competitive_landscape.competitors_evaluating,
        },
        budget_timeline: form.budget_timeline,
        demo_poc_request: form.demo_poc_request,
        resources_shared: form.resources_shared || undefined,
        resources_requested_by_customer: form.resources_requested_by_customer || undefined,
        resources_requested_by_us: form.resources_requested_by_us || undefined,
        next_meeting: form.next_meeting.date
          ? {
              date: form.next_meeting.date.includes("T")
                ? form.next_meeting.date
                : `${form.next_meeting.date}T12:00:00.000Z`,
              agenda: form.next_meeting.agenda || undefined,
              attendees: form.next_meeting.attendees,
            }
          : undefined,
        open_questions: form.open_questions || undefined,
        key_topics: form.key_topics || undefined,
        decisions_made: form.decisions_made || undefined,
        opportunity_id: form.tech_win.opportunity_id || undefined,
        tech_status: form.tech_win.tech_status || undefined,
        tech_status_reason: form.tech_win.tech_status_reason || undefined,
        path_to_tech_win: form.tech_win.path_to_tech_win || undefined,
        next_milestone: form.tech_win.next_milestone_date
          ? {
              date: form.tech_win.next_milestone_date.includes("T")
                ? form.tech_win.next_milestone_date
                : `${form.tech_win.next_milestone_date}T12:00:00.000Z`,
              description: form.tech_win.next_milestone_description || undefined,
            }
          : undefined,
        what_changed: form.tech_win.what_changed || undefined,
        help_needed: form.tech_win.help_needed || undefined,
      });
    }
    let res: IngestResponse;
    try {
      res = await ingest(notesPayload, listUser);
    } catch (e) {
      setIngestResults([
        {
          success: false,
          action: "error",
          version: 0,
          error: e instanceof Error ? e.message : "Ingest request failed",
        },
      ]);
      return;
    }
    setIngestResults(res.results);
    for (const r of res.results) {
      if (r.success && r.elastic_doc_id) clearDraft(r.elastic_doc_id);
    }
    void refetchGranola();
    if (tab === "elastic")
      void searchElastic({
        account: efilters.account || undefined,
        opportunity: efilters.opportunity || undefined,
        meeting_type: efilters.meeting_type || undefined,
        tags: efilters.tags || undefined,
        q: efilters.q || undefined,
        page: efilters.page,
        size: efilters.size,
      });
  };

  const saveDraftClick = () => {
    if (!activeId) return;
    saveDraft(activeId, form);
  };

  const elasticRows = elasticData?.notes ?? [];

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">My Notes</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          Review Granola notes or ingested Elastic docs, enrich metadata, then ingest to Elastic and your Drive
          folder.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-12">
        <section className="flex min-h-[420px] flex-col rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm xl:col-span-3">
          <div className="border-b border-slate-100 dark:border-slate-800 p-3">
            <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-medium">
              <button
                type="button"
                className={`flex-1 rounded-md px-2 py-1.5 ${tab === "granola" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm" : "text-slate-600 dark:text-slate-300"}`}
                onClick={() => setTab("granola")}
              >
                From Granola
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-2 py-1.5 ${tab === "elastic" ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm" : "text-slate-600 dark:text-slate-300"}`}
                onClick={() => setTab("elastic")}
              >
                In Elastic
              </button>
            </div>
          </div>

          {tab === "granola" ? (
            <div className="space-y-2 border-b border-slate-100 dark:border-slate-800 p-3 text-xs">
              <label className="block font-medium text-slate-600 dark:text-slate-300">Team member</label>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
                value={listUser ?? ""}
                onChange={(e) => {
                  setListUser(e.target.value);
                  setSessionUserEmail(e.target.value);
                }}
              >
                {!team.length ? (
                  <option value="">Add a member in Settings</option>
                ) : null}
                {team.map((m) => (
                  <option key={m.user_email} value={m.user_email}>
                    {m.user_name ?? m.user_email}
                  </option>
                ))}
              </select>
              <label className="mt-2 block font-medium text-slate-600 dark:text-slate-300">Created after</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-sm"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <label className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={showIngested}
                  onChange={(e) => setShowIngested(e.target.checked)}
                />
                Show already ingested
              </label>
              {gError ? <p className="text-rose-600">{gError}</p> : null}
            </div>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto border-b border-slate-100 dark:border-slate-800 p-3 text-xs">
              {(["account", "opportunity", "meeting_type", "tags", "q"] as const).map((k) => (
                <input
                  key={k}
                  className="w-full rounded border border-slate-200 dark:border-slate-800 px-2 py-1"
                  placeholder={k}
                  value={efilters[k]}
                  onChange={(e) => setEfilters((f) => ({ ...f, [k]: e.target.value }))}
                />
              ))}
              <button
                type="button"
                className="w-full rounded-lg bg-slate-900 py-1.5 text-xs font-medium text-white"
                onClick={() =>
                  void searchElastic({
                    account: efilters.account || undefined,
                    opportunity: efilters.opportunity || undefined,
                    meeting_type: efilters.meeting_type || undefined,
                    tags: efilters.tags || undefined,
                    q: efilters.q || undefined,
                    page: efilters.page,
                    size: efilters.size,
                  })
                }
              >
                Search
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {tab === "granola" ? (
              gLoading ? (
                <p className="p-2 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
              ) : (
                <ul className="space-y-1">
                  {filteredGranola.map((r: GranolaListRow) => (
                    <li key={r.id}>
                      <label
                        className={`flex cursor-pointer gap-2 rounded-lg border px-2 py-2 text-sm ${
                          activeId === r.id
                            ? "border-slate-900 bg-slate-50 dark:bg-slate-800/40"
                            : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                        } ${r.already_ingested ? "opacity-80" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setActiveId(r.id);
                            setTab("granola");
                            void loadDetailGranola(r.id);
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="line-clamp-2 font-medium text-slate-900 dark:text-white">
                              {r.title || "Untitled"}
                            </span>
                            {r.already_ingested ? (
                              <span className="shrink-0 text-emerald-600" title="Ingested">
                                ✓{r.version ? ` v${r.version}` : ""}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <time dateTime={r.date}>{new Date(r.date).toLocaleDateString()}</time>
                            {r.already_ingested &&
                            (!r.current_metadata?.account || !(r.current_metadata?.tags?.length ?? 0)) ? (
                              <span className="text-amber-500" title="Incomplete metadata">
                                ●
                              </span>
                            ) : null}
                          </div>
                        </button>
                      </label>
                    </li>
                  ))}
                </ul>
              )
            ) : elasticLoading ? (
              <p className="p-2 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : elasticError ? (
              <p className="p-2 text-sm text-rose-600">{elasticError}</p>
            ) : (
              <ul className="space-y-1">
                {elasticRows.map((r) => {
                  const id = String(r.note_id ?? r._id ?? "");
                  return (
                    <li key={id}>
                      <label
                        className={`flex cursor-pointer gap-2 rounded-lg border px-2 py-2 text-sm ${
                          activeId === id ? "border-slate-900 bg-slate-50 dark:bg-slate-800/40" : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleSelect(id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setActiveId(id);
                            void loadDetailElastic(id);
                          }}
                        >
                          <div className="font-medium text-slate-900 dark:text-white line-clamp-2">
                            {String(r.title ?? "Untitled")}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {r.meeting_date
                              ? new Date(String(r.meeting_date)).toLocaleString()
                              : ""}{" "}
                            · v{String(r.version ?? 1)}
                          </div>
                        </button>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="min-h-[420px] xl:col-span-5">
          {detailLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">Loading…</div>
          ) : (
            <NotePreview detail={detail} elasticBanner={elasticBanner} />
          )}
        </section>

        <section className="min-h-[420px] xl:col-span-4">
          <EnrichPanel
            form={form}
            onChange={setForm}
            lookups={lookups}
            suggestedTags={suggestedTags}
            onAddLookup={onAddLookup}
          />
        </section>
      </div>

      <footer className="sticky bottom-0 z-20 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">{selected.size} note(s) selected</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={saveDraftClick}
              disabled={!activeId}
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={!selected.size || ingesting || !listUser}
              onClick={() => void runIngest()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-40"
            >
              {ingesting ? "Working…" : ingestLabel}
            </button>
          </div>
        </div>
        <IngestProgress results={ingestResults} />
      </footer>
    </div>
  );
}
