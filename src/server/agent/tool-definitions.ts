export interface ToolPropertySchema {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolPropertySchema>;
    required?: string[];
  };
}

const prop = (
  type: string,
  description: string,
  options?: { enum?: string[] },
): ToolPropertySchema => ({ type, description, ...options });

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_notes",
    description: "BM25 search across meeting note titles and summaries (best-fields).",
    parameters: {
      type: "object",
      properties: {
        query: prop("string", "Search query (required)"),
        account: prop("string", "Filter to a specific account name or key"),
        size: prop("number", "Max number of results (default 10)"),
      },
      required: ["query"],
    },
  },
  {
    name: "semantic_search_transcripts",
    description: "Hybrid retrieval with rerank over transcripts, summaries, and topics for semantic Q&A.",
    parameters: {
      type: "object",
      properties: {
        query: prop("string", "Natural-language query (required)"),
        account: prop("string", "Filter to a specific account"),
        size: prop("number", "Max number of results (default 8)"),
      },
      required: ["query"],
    },
  },
  {
    name: "get_note_by_id",
    description: "Fetch a single ingested note document by its note_id.",
    parameters: {
      type: "object",
      properties: {
        note_id: prop("string", "Granola / pipeline note id (required)"),
      },
      required: ["note_id"],
    },
  },
  {
    name: "get_account_brief",
    description: "Return rollup summary and intelligence for an account (account rollups index).",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Account name or id (required)"),
      },
      required: ["account"],
    },
  },
  {
    name: "get_meeting_timeline",
    description: "List recent meetings for an account, newest first.",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Account to filter (required)"),
        limit: prop("number", "Max meetings to return (default 20)"),
      },
      required: ["account"],
    },
  },
  {
    name: "list_open_action_items",
    description: "List open action items with optional account, owner, and overdue filter.",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Filter by account"),
        owner: prop("string", "Filter by owner email or name"),
        overdue_only: prop("boolean", "If true, only return overdue open items"),
      },
    },
  },
  {
    name: "list_followups_due",
    description:
      "Action items and scheduled next meetings with due or follow-up dates in the given lookahead window.",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Filter by account"),
        days_ahead: prop("number", "Number of days ahead to include (default 7)"),
      },
    },
  },
  {
    name: "get_pursuit_team",
    description: "Return pursuit team document for the account (AE/SA/overlay mapping).",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Account (required)"),
      },
      required: ["account"],
    },
  },
  {
    name: "list_my_accounts",
    description: "List accounts where the user appears as a pursuit team member.",
    parameters: {
      type: "object",
      properties: {
        user_email: prop("string", "User email to match in pursuit team members (required)"),
      },
      required: ["user_email"],
    },
  },
  {
    name: "list_attendees_on_account",
    description: "Aggregate distinct attendee names/emails seen across meeting notes for an account.",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Account (required)"),
      },
      required: ["account"],
    },
  },
  {
    name: "list_competitors_seen",
    description: "Competitor mentions from account rollup or, if missing, from recent notes.",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Account (required)"),
      },
      required: ["account"],
    },
  },
  {
    name: "search_lookups",
    description: "Search curated lookup values (UI dropdowns) by type.",
    parameters: {
      type: "object",
      properties: {
        type: prop("string", "Lookup type", {
          enum: ["account", "opportunity", "tag", "meeting_type", "sales_stage"],
        }),
      },
      required: ["type"],
    },
  },
  {
    name: "compare_two_accounts",
    description: "Side-by-side comparison of two accounts using rollups and key rollup metrics diff.",
    parameters: {
      type: "object",
      properties: {
        account_a: prop("string", "First account (required)"),
        account_b: prop("string", "Second account (required)"),
      },
      required: ["account_a", "account_b"],
    },
  },
  {
    name: "build_call_prep_brief",
    description: "Assemble call prep: pursuit team, last 3 meetings, open action items, sentiment, next meeting.",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Account (required)"),
        user_email: prop("string", "Optional acting user for context"),
      },
      required: ["account"],
    },
  },
  {
    name: "flag_at_risk_accounts",
    description:
      "Flag accounts with negative sentiment in rollups or stale meeting activity (default 30 days).",
    parameters: {
      type: "object",
      properties: {
        min_days_stale: prop("number", "Optional override for how old last_meeting_date must be to count as stale"),
      },
    },
  },
  {
    name: "summarize_recent_changes",
    description: "Diff-style summary: rollup state plus the two most recently updated or ingested notes.",
    parameters: {
      type: "object",
      properties: {
        account: prop("string", "Account (required)"),
      },
      required: ["account"],
    },
  },
  {
    name: "sfdc_update_opportunity",
    description: "Queue an opportunity field update in Salesforce (stub: manual entry).",
    parameters: {
      type: "object",
      properties: {
        opportunity_id: prop("string", "Salesforce Opportunity Id (18 chars) (required)"),
        stage: prop("string", "Opportunity stage name"),
        amount: prop("string", "Opportunity amount as a string (currency-safe)"),
        close_date: prop("string", "Close date (ISO)"),
      },
      required: ["opportunity_id"],
    },
  },
  {
    name: "sfdc_log_call",
    description: "Queue a call log on the opportunity in Salesforce (stub: manual entry).",
    parameters: {
      type: "object",
      properties: {
        opportunity_id: prop("string", "Opportunity id (required)"),
        subject: prop("string", "Call subject (required)"),
        description: prop("string", "Call body / notes (required)"),
        duration_minutes: prop("number", "Call length in minutes"),
      },
      required: ["opportunity_id", "subject", "description"],
    },
  },
  {
    name: "sfdc_create_task",
    description: "Queue a task on the opportunity in Salesforce (stub: manual entry).",
    parameters: {
      type: "object",
      properties: {
        opportunity_id: prop("string", "Opportunity id (required)"),
        subject: prop("string", "Task subject (required)"),
        description: prop("string", "Task description"),
        due_date: prop("string", "Due date (ISO)"),
        assigned_to: prop("string", "Assignee (email or name) (required)"),
      },
      required: ["opportunity_id", "subject", "assigned_to"],
    },
  },
  {
    name: "create_alert",
    description: "Create a deduplicated in-app / Elastic alert for an account owner.",
    parameters: {
      type: "object",
      properties: {
        alert_type: prop("string", "Arbitrary alert type label (required)"),
        account: prop("string", "Account (required)"),
        owner: prop("string", "Owner email to notify (required)"),
        severity: prop("string", "Severity", { enum: ["low", "medium", "high"] }),
        message: prop("string", "Alert body (required)"),
      },
      required: ["alert_type", "account", "owner", "severity", "message"],
    },
  },
  {
    name: "list_my_alerts",
    description: "List alerts for a user, optionally unread only.",
    parameters: {
      type: "object",
      properties: {
        user_email: prop("string", "Owner / recipient email (required)"),
        unread_only: prop("boolean", "If true, only return unread alerts"),
      },
      required: ["user_email"],
    },
  },
];
