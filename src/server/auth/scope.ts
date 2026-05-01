import type { Request } from "express";
import { getElastic } from "../elastic-instance.js";
import {
  OPPORTUNITIES_INDEX,
  PURSUIT_TEAM_INDEX,
} from "../constants/elastic.js";
import { multiUserEnabled } from "./middleware.js";
import type { SessionUser } from "./types.js";

/**
 * The set of accounts and opportunity ids a single user is allowed to read.
 * Computed from:
 *   1. account-pursuit-team membership (cross-functional collaborators)
 *   2. opportunities where the user appears anywhere in the reporting chain
 *   3. attendee/author/ingested_by fields are checked on the note itself
 *      (added inline in noteVisibilityFilter — no extra query needed).
 *
 * Admins (and the MULTI_USER=false dev fallback user) bypass all filters.
 */
export interface UserScope {
  email: string;
  isAdmin: boolean;
  pursuitAccounts: string[];
  visibleOppIds: string[];
  /** Union of pursuit accounts + accounts from visible opps. */
  visibleAccounts: string[];
}

export const ADMIN_SCOPE_SENTINEL = "__admin__";

/** A scope object that grants admin-level access. */
function makeAdminScope(email: string): UserScope {
  return {
    email,
    isAdmin: true,
    pursuitAccounts: [],
    visibleOppIds: [],
    visibleAccounts: [],
  };
}

/**
 * Compute the scope for a user from Elastic. This issues two parallel
 * searches: pursuit-team membership and reporting-chain opportunities. The
 * response is cached on `req` (see `getRequestScope`) so a single request
 * never re-resolves.
 */
export async function resolveUserScope(user: SessionUser): Promise<UserScope> {
  if (user.isAdmin) return makeAdminScope(user.email);

  const elastic = getElastic();
  const client = (elastic as unknown as { client: import("@elastic/elasticsearch").Client })
    .client;
  const email = user.email.trim().toLowerCase();

  const [pursuitRes, oppsRes] = await Promise.all([
    client.search<{ account?: string }>({
      index: PURSUIT_TEAM_INDEX,
      size: 500,
      _source: ["account"],
      query: {
        nested: {
          path: "members",
          query: { term: { "members.email": email } },
        },
      } as never,
    }),
    client.search<{ opp_id?: string; account?: string }>({
      index: OPPORTUNITIES_INDEX,
      size: 1000,
      _source: ["opp_id", "account"],
      query: {
        bool: {
          should: [
            { term: { owner_ae_email: email } },
            { term: { owner_se_email: email } },
            { term: { manager_email: email } },
            { term: { director_email: email } },
            { term: { vp_email: email } },
            { term: { rvp_email: email } },
            { term: { avp_email: email } },
          ],
          minimum_should_match: 1,
        },
      } as never,
    }),
  ]);

  const pursuitAccounts = [
    ...new Set(
      pursuitRes.hits.hits
        .map((h) => h._source?.account)
        .filter((a): a is string => typeof a === "string" && a.length > 0),
    ),
  ];
  const visibleOppIds: string[] = [];
  const accountsFromOpps: string[] = [];
  for (const h of oppsRes.hits.hits) {
    const src = h._source ?? {};
    if (typeof src.opp_id === "string" && src.opp_id) visibleOppIds.push(src.opp_id);
    if (typeof src.account === "string" && src.account) accountsFromOpps.push(src.account);
  }
  const visibleAccounts = [...new Set([...pursuitAccounts, ...accountsFromOpps])];

  return {
    email,
    isAdmin: false,
    pursuitAccounts,
    visibleOppIds,
    visibleAccounts,
  };
}

/** Per-request cache so multiple endpoint calls don't redundantly resolve. */
export async function getRequestScope(req: Request): Promise<UserScope> {
  if (!multiUserEnabled() && req.user?.isAdmin) {
    return makeAdminScope(req.user.email);
  }
  const cache = req as Request & { __scope?: UserScope };
  if (cache.__scope) return cache.__scope;
  if (!req.user) {
    throw new Error("getRequestScope called without req.user (requireUser must run first)");
  }
  const scope = await resolveUserScope(req.user);
  cache.__scope = scope;
  return scope;
}

type EsFilter = Record<string, unknown>;

/** A query that matches zero documents. */
const MATCH_NOTHING: EsFilter = { bool: { must_not: [{ match_all: {} }] } };

/**
 * Build the visibility `bool.should` clause for the granola-meeting-notes
 * index. Returns `null` for admins (no filtering needed). The clause is
 * meant to be ANDed into a route's existing `bool.filter` array.
 *
 *   visibility = author_email == me
 *              | ingested_by == me
 *              | me ∈ attendees
 *              | account ∈ pursuit_accounts ∪ chain_accounts
 *              | opportunity_id ∈ chain_opps
 */
export function noteVisibilityFilter(scope: UserScope): EsFilter | null {
  if (scope.isAdmin) return null;
  const should: EsFilter[] = [
    { term: { author_email: scope.email } },
    { term: { ingested_by: scope.email } },
    { term: { attendee_names: scope.email } },
    {
      nested: {
        path: "attendees",
        query: { term: { "attendees.email": scope.email } },
      },
    },
  ];
  if (scope.visibleAccounts.length) {
    should.push({ terms: { account: scope.visibleAccounts } });
  }
  if (scope.visibleOppIds.length) {
    should.push({ terms: { opportunity_id: scope.visibleOppIds } });
  }
  return { bool: { should, minimum_should_match: 1 } };
}

/**
 * Build the visibility filter for the opportunities and opportunity-rollups
 * indexes. Returns null for admins. Returns a "match-nothing" filter for
 * users with no chain access at all (so we never accidentally fall through
 * to all opps).
 */
export function opportunityVisibilityFilter(scope: UserScope): EsFilter | null {
  if (scope.isAdmin) return null;
  const should: EsFilter[] = [];
  if (scope.visibleOppIds.length) {
    should.push({ terms: { opp_id: scope.visibleOppIds } });
  }
  if (scope.pursuitAccounts.length) {
    should.push({ terms: { account: scope.pursuitAccounts } });
  }
  if (should.length === 0) {
    return MATCH_NOTHING;
  }
  return { bool: { should, minimum_should_match: 1 } };
}

/**
 * Build the visibility filter for the account-rollups and pursuit-team
 * indexes (account-keyed). Returns null for admins, match-nothing for users
 * with no visible accounts.
 */
export function accountVisibilityFilter(scope: UserScope): EsFilter | null {
  if (scope.isAdmin) return null;
  if (scope.visibleAccounts.length === 0) {
    return MATCH_NOTHING;
  }
  return { terms: { account: scope.visibleAccounts } };
}

/**
 * Convenience: tell a route whether a single (account, opp_id) tuple is
 * visible to the caller. Used to gate single-resource fetches.
 */
export function canSeeAccount(scope: UserScope, account: string | null | undefined): boolean {
  if (scope.isAdmin) return true;
  if (!account) return false;
  return scope.visibleAccounts.includes(account);
}

export function canSeeOpportunity(scope: UserScope, oppId: string | null | undefined): boolean {
  if (scope.isAdmin) return true;
  if (!oppId) return false;
  return scope.visibleOppIds.includes(oppId);
}

/**
 * In-process visibility check for a single note document (mirror of
 * `noteVisibilityFilter` for cases where we already hold the note in
 * memory, e.g. `getIngestedNote` by id).
 */
export function canSeeNote(
  scope: UserScope,
  note: Record<string, unknown> | null | undefined,
): boolean {
  if (scope.isAdmin) return true;
  if (!note) return false;
  const email = scope.email;
  const author = typeof note.author_email === "string" ? note.author_email.toLowerCase() : "";
  if (author === email) return true;
  const ingestedBy = typeof note.ingested_by === "string" ? note.ingested_by.toLowerCase() : "";
  if (ingestedBy === email) return true;
  const names = Array.isArray(note.attendee_names) ? note.attendee_names : [];
  if (names.some((n) => typeof n === "string" && n.toLowerCase() === email)) return true;
  if (Array.isArray(note.attendees)) {
    for (const a of note.attendees) {
      if (
        a &&
        typeof a === "object" &&
        typeof (a as { email?: unknown }).email === "string" &&
        ((a as { email: string }).email).toLowerCase() === email
      ) {
        return true;
      }
    }
  }
  const account = typeof note.account === "string" ? note.account : "";
  if (account && scope.visibleAccounts.includes(account)) return true;
  const oppId = typeof note.opportunity_id === "string" ? note.opportunity_id : "";
  if (oppId && scope.visibleOppIds.includes(oppId)) return true;
  return false;
}
