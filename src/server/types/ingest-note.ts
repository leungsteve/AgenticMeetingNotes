/** Attendee row stored in Elastic (nested). */
export interface AttendeeInput {
  name?: string | null;
  title?: string | null;
  company?: string | null;
  email?: string | null;
  role_flag?: string | null;
}

export interface ActionItemInput {
  description?: string | null;
  owner?: string | null;
  due_date?: string | null;
  status?: string | null;
}

export interface CommitmentInput {
  description?: string | null;
  committed_by?: string | null;
  timeline?: string | null;
}

export interface TechnicalEnvironmentInput {
  current_stack?: string | null;
  pain_points?: string | null;
  requirements?: string | null;
  scale?: string | null;
  integrations?: string | null;
  constraints?: string | null;
}

export interface CustomerSentimentInput {
  overall?: string | null;
  concerns?: string | null;
  objections?: string | null;
  champion_signals?: string | null;
}

export interface CompetitiveLandscapeInput {
  incumbent?: string | null;
  competitors_evaluating?: string[] | null;
  mentions?: string | null;
  differentiators?: string | null;
}

export interface BudgetTimelineInput {
  budget?: string | null;
  timeline?: string | null;
  procurement?: string | null;
  stage_signals?: string | null;
}

export interface DemoPocRequestInput {
  description?: string | null;
  requirements?: string | null;
  data_available?: string | null;
  timeline?: string | null;
  success_criteria?: string | null;
  audience?: string | null;
}

export interface NextMeetingInput {
  date?: string | null;
  agenda?: string | null;
  attendees?: string[] | null;
}

export interface NextMilestoneInput {
  date?: string | null;
  description?: string | null;
}

/** Payload for indexing / re-indexing a meeting note. */
export interface IngestNoteInput {
  note_id: string;
  meeting_group_id?: string | null;
  account?: string | null;
  opportunity?: string | null;
  team?: string | null;
  author_email?: string | null;
  author_name?: string | null;
  author_role?: string | null;
  attendees?: AttendeeInput[] | null;
  meeting_date?: string | null;
  ingested_by?: string | null;
  meeting_purpose?: string | null;
  scheduled_by?: string | null;
  title?: string | null;
  summary?: string | null;
  transcript?: string | null;
  key_topics?: string | null;
  decisions_made?: string | null;
  open_questions?: string | null;
  technical_environment?: TechnicalEnvironmentInput | null;
  action_items?: ActionItemInput[] | null;
  commitments?: CommitmentInput[] | null;
  customer_sentiment?: CustomerSentimentInput | null;
  competitive_landscape?: CompetitiveLandscapeInput | null;
  budget_timeline?: BudgetTimelineInput | null;
  demo_poc_request?: DemoPocRequestInput | null;
  resources_shared?: string | null;
  resources_requested_by_customer?: string | null;
  resources_requested_by_us?: string | null;
  next_meeting?: NextMeetingInput | null;
  tags?: string[] | null;
  meeting_type?: string | null;
  sales_stage?: string | null;
  local_file_path?: string | null;
  opportunity_id?: string | null;
  tech_status?: string | null;
  tech_status_reason?: string | null;
  path_to_tech_win?: string | null;
  next_milestone?: NextMilestoneInput | null;
  what_changed?: string | null;
  help_needed?: string | null;
}
