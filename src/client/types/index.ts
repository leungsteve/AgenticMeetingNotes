/** Row from GET /api/notes (Granola list + ingest flags). */
export interface GranolaListRow {
  id: string;
  title: string | null;
  date: string;
  attendees: number;
  already_ingested: boolean;
  ingested_date?: string;
  version?: number;
  current_metadata?: {
    account?: string | null;
    opportunity?: string | null;
    tags?: string[];
    meeting_type?: string | null;
    sales_stage?: string | null;
  };
}

/** GET /api/notes/:id */
export interface NoteDetailResponse {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  owner: { name: string | null; email: string };
  web_url?: string;
  calendar_event?: Record<string, unknown> | null | undefined;
  attendees: Array<{ name: string | null; email: string }>;
  summary_text: string;
  summary_markdown: string | null;
  transcript: string | null;
  suggested_tags: string[];
  parsed_from_summary?: Record<string, unknown>;
  elastic_metadata?: Record<string, unknown> | null;
}

export interface TeamMemberRow {
  user_email: string;
  user_name?: string;
  user_role?: string;
  granola_api_key_masked?: string;
  total_notes_ingested?: number;
}

export interface LookupRow {
  type: string;
  value: string;
  label: string;
}

export interface IngestedSearchResponse {
  total: number;
  page: number;
  size: number;
  notes: Array<Record<string, unknown> & { note_id?: string; _id?: string }>;
}

export interface IngestRowResult {
  success: boolean;
  action: "created" | "updated" | "error";
  version: number;
  elastic_doc_id?: string;
  local_file_path?: string;
  error?: string;
}

export interface IngestResponse {
  results: IngestRowResult[];
  success_count: number;
}

/** Full enrichment payload aligned with POST /api/ingest. */
export interface EnrichmentForm {
  account: string;
  opportunity: string;
  meeting_type: string;
  sales_stage: string;
  meeting_purpose: string;
  scheduled_by: string;
  tags: string[];
  attendees: Array<{
    name?: string;
    title?: string;
    company?: string;
    email?: string;
    role_flag?: string;
  }>;
  action_items: Array<{
    description?: string;
    owner?: string;
    due_date?: string;
    status?: string;
  }>;
  commitments: Array<{
    description?: string;
    committed_by?: string;
    timeline?: string;
  }>;
  technical_environment: {
    current_stack: string;
    pain_points: string;
    requirements: string;
    scale: string;
    integrations: string;
    constraints: string;
  };
  customer_sentiment: {
    overall: string;
    concerns: string;
    objections: string;
    champion_signals: string;
  };
  competitive_landscape: {
    incumbent: string;
    competitors_evaluating: string[];
    mentions: string;
    differentiators: string;
  };
  budget_timeline: {
    budget: string;
    timeline: string;
    procurement: string;
    stage_signals: string;
  };
  demo_poc_request: {
    description: string;
    requirements: string;
    data_available: string;
    timeline: string;
    success_criteria: string;
    audience: string;
  };
  resources_shared: string;
  resources_requested_by_customer: string;
  resources_requested_by_us: string;
  next_meeting: {
    date: string;
    agenda: string;
    attendees: string[];
  };
  open_questions: string;
  key_topics: string;
  decisions_made: string;
  tech_win: {
    opportunity_id: string;
    tech_status: "" | "red" | "yellow" | "green";
    tech_status_reason: string;
    path_to_tech_win: string;
    next_milestone_date: string;
    next_milestone_description: string;
    what_changed: string;
    help_needed: string;
  };
}

export interface OpportunityRow {
  opp_id: string;
  account: string;
  opp_name?: string;
  acv?: number;
  close_quarter?: string;
  forecast_category?: string;
  sales_stage?: string;
  owner_se_email?: string;
  owner_ae_email?: string;
  manager_email?: string;
  tier?: string;
  updated_at?: string;
}

export function emptyEnrichmentForm(): EnrichmentForm {
  return {
    account: "",
    opportunity: "",
    meeting_type: "",
    sales_stage: "",
    meeting_purpose: "",
    scheduled_by: "",
    tags: [],
    attendees: [],
    action_items: [],
    commitments: [],
    technical_environment: {
      current_stack: "",
      pain_points: "",
      requirements: "",
      scale: "",
      integrations: "",
      constraints: "",
    },
    customer_sentiment: {
      overall: "",
      concerns: "",
      objections: "",
      champion_signals: "",
    },
    competitive_landscape: {
      incumbent: "",
      competitors_evaluating: [],
      mentions: "",
      differentiators: "",
    },
    budget_timeline: {
      budget: "",
      timeline: "",
      procurement: "",
      stage_signals: "",
    },
    demo_poc_request: {
      description: "",
      requirements: "",
      data_available: "",
      timeline: "",
      success_criteria: "",
      audience: "",
    },
    resources_shared: "",
    resources_requested_by_customer: "",
    resources_requested_by_us: "",
    next_meeting: { date: "", agenda: "", attendees: [] },
    open_questions: "",
    key_topics: "",
    decisions_made: "",
    tech_win: {
      opportunity_id: "",
      tech_status: "",
      tech_status_reason: "",
      path_to_tech_win: "",
      next_milestone_date: "",
      next_milestone_description: "",
      what_changed: "",
      help_needed: "",
    },
  };
}

export interface PursuitTeamMember {
  email: string;
  name: string;
  /**
   * Pursuit-team role. Mirrors the org spine on the opportunity (SA / SA
   * Manager / SA Director / SA VP / AE / Sales RVP / Sales AVP / CA), with
   * "Leader" kept as a legacy bucket for older docs and "Other" as a
   * catch-all for partners, exec sponsors, etc.
   */
  role:
    | "SA"
    | "SA Manager"
    | "SA Director"
    | "SA VP"
    | "AE"
    | "Sales RVP"
    | "Sales AVP"
    | "CA"
    | "Leader"
    | "Other";
}

export interface PursuitTeam {
  account: string;
  account_display: string;
  members: PursuitTeamMember[];
  notes?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface AccountRollup {
  account: string;
  meeting_count: number;
  last_meeting_date?: string;
  first_meeting_date?: string;
  open_action_items: number;
  overdue_action_items: number;
  competitors_seen: string[];
  sentiment_counts: Record<string, number>;
  latest_sentiment?: string;
  momentum_score?: number;
  computed_at?: string;
}

export interface AgentAlert {
  _id: string;
  alert_type: string;
  account: string;
  owner: string;
  severity: "low" | "medium" | "high";
  message: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface ActionItem {
  _id?: string;
  source_note_id: string;
  account: string;
  meeting_date?: string;
  meeting_title?: string;
  description: string;
  owner: string;
  due_date?: string;
  status: "open" | "done";
}

export type AgentPersona =
  | "ae"
  | "sa"
  | "ca"
  | "se"
  | "manager"
  | "director"
  | "vp"
  | "sales_rvp"
  | "sales_avp";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ note_id: string; title: string; date?: string }>;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  persona: AgentPersona;
  messages: ChatMessage[];
  created_at: string;
}
