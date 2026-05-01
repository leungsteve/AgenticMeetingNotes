import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errors } from "@elastic/elasticsearch";
import type { Client } from "@elastic/elasticsearch";
import { createElasticsearchClientFromEnv } from "../src/server/config/elastic-client.js";
import { PURSUIT_TEAM_INDEX } from "../src/server/constants/elastic.js";

const OPP_INDEX = "opportunities";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CSV_PATH = path.resolve(__dirname, "..", "data", "opportunities.csv");

interface OpportunityRow {
  opp_id: string;
  account: string;
  account_display?: string;
  opp_name?: string;
  acv?: number;
  close_quarter?: string;
  close_date?: string;
  forecast_category?: string;
  sales_stage?: string;
  owner_se_email?: string;
  owner_se_name?: string;
  owner_ae_email?: string;
  owner_ae_name?: string;
  manager_email?: string;
  director_email?: string;
  vp_email?: string;
  rvp_email?: string;
  avp_email?: string;
  tier?: string;
  region?: string;
  notes?: string;
  source: string;
  updated_at: string;
}

/**
 * RFC-4180-ish CSV parser: handles quoted fields containing commas, escaped
 * double quotes ("") inside quotes, and CR/LF line endings. Sufficient for our
 * hand-maintained spine file; we deliberately avoid pulling in a CSV dep.
 */
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

function loadOpportunities(csvPath: string): OpportunityRow[] {
  const raw = readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length < 2) {
    throw new Error(`CSV at ${csvPath} has no data rows`);
  }
  const header = rows[0].map((h) => h.trim());
  const out: OpportunityRow[] = [];
  const stamp = new Date().toISOString();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells.length || cells.every((c) => !c?.trim())) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = (cells[c] ?? "").trim();
    }
    const opp_id = obj.opp_id;
    if (!opp_id) {
      console.warn(`[seed-opportunities] row ${r} missing opp_id, skipping`);
      continue;
    }
    if (!obj.account) {
      console.warn(`[seed-opportunities] row ${r} (opp_id=${opp_id}) missing account, skipping`);
      continue;
    }
    const acvStr = obj.acv?.replace(/[$,]/g, "");
    const acv = acvStr && !Number.isNaN(Number(acvStr)) ? Number(acvStr) : undefined;
    out.push({
      opp_id,
      account: obj.account,
      account_display: obj.account_display || obj.account,
      opp_name: obj.opp_name || undefined,
      acv,
      close_quarter: obj.close_quarter || undefined,
      close_date: obj.close_date || undefined,
      forecast_category: obj.forecast_category?.toLowerCase() || undefined,
      sales_stage: obj.sales_stage?.toLowerCase() || undefined,
      owner_se_email: obj.owner_se_email?.toLowerCase() || undefined,
      owner_se_name: obj.owner_se_name || undefined,
      owner_ae_email: obj.owner_ae_email?.toLowerCase() || undefined,
      owner_ae_name: obj.owner_ae_name || undefined,
      manager_email: obj.manager_email?.toLowerCase() || undefined,
      director_email: obj.director_email?.toLowerCase() || undefined,
      vp_email: obj.vp_email?.toLowerCase() || undefined,
      rvp_email: obj.rvp_email?.toLowerCase() || undefined,
      avp_email: obj.avp_email?.toLowerCase() || undefined,
      tier: obj.tier || undefined,
      region: obj.region || undefined,
      notes: obj.notes || undefined,
      source: "csv",
      updated_at: stamp,
    });
  }
  return out;
}

async function main(): Promise<void> {
  if (!process.env.ELASTIC_CLOUD_ID?.trim() || !process.env.ELASTIC_API_KEY?.trim()) {
    console.error(
      "Missing ELASTIC_CLOUD_ID or ELASTIC_API_KEY. See the Elastic Serverless Setup Guide in PROJECT_BRIEF.md.",
    );
    process.exit(1);
  }

  const csvPath = process.argv[2]?.trim() || DEFAULT_CSV_PATH;

  let client: Client;
  try {
    client = createElasticsearchClientFromEnv();
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Failed to create Elasticsearch client.");
    process.exit(1);
  }

  try {
    await client.ping();
  } catch (err) {
    console.error("\nCould not reach Elasticsearch. Verify credentials and that the project is not paused.\n");
    if (err instanceof errors.ResponseError) {
      console.error(`HTTP ${err.meta.statusCode}: ${err.message}`);
    } else if (err instanceof Error) {
      console.error(err.message);
    }
    process.exit(1);
  }

  const exists = await client.indices.exists({ index: OPP_INDEX });
  if (!exists) {
    console.error(`Index "${OPP_INDEX}" does not exist. Run: npm run setup:elastic`);
    process.exit(1);
  }

  const rows = loadOpportunities(csvPath);
  if (!rows.length) {
    console.error(`No opportunity rows parsed from ${csvPath}`);
    process.exit(1);
  }

  let upserted = 0;
  for (const doc of rows) {
    await client.index({
      index: OPP_INDEX,
      id: doc.opp_id,
      document: doc,
    });
    upserted++;
  }
  await client.indices.refresh({ index: OPP_INDEX });

  // Derive a pursuit team per unique account from the CSV. Members = SE + AE +
  // manager (manager has no name in the CSV, so we synthesize one from the
  // local-part of the email). The Accounts page reads from this index, so this
  // step is what makes /accounts populate without a hand-curated step.
  const teamExists = await client.indices.exists({ index: PURSUIT_TEAM_INDEX });
  let teamsUpserted = 0;
  if (!teamExists) {
    console.warn(
      `[seed-opportunities] Index "${PURSUIT_TEAM_INDEX}" missing — skipping pursuit-team derivation. Run npm run setup:elastic.`,
    );
  } else {
    const stamp = new Date().toISOString();
    const byAccount = new Map<string, OpportunityRow[]>();
    for (const r of rows) {
      const list = byAccount.get(r.account) ?? [];
      list.push(r);
      byAccount.set(r.account, list);
    }
    type PursuitRole =
      | "SA"
      | "SA Manager"
      | "SA Director"
      | "SA VP"
      | "AE"
      | "Sales RVP"
      | "Sales AVP";
    // Higher index = more senior. If the same email appears in two roles
    // (e.g. an SA Manager who is also the named SA on a small deal), keep
    // the more senior one so the Accounts view shows the leadership badge.
    const roleRank: Record<PursuitRole, number> = {
      SA: 0,
      AE: 0,
      "SA Manager": 1,
      "Sales RVP": 1,
      "SA Director": 2,
      "Sales AVP": 2,
      "SA VP": 3,
    };
    for (const [account, oppRows] of byAccount) {
      const display = oppRows[0]?.account_display || account;
      const seen = new Map<string, { email: string; name: string; role: PursuitRole }>();
      const add = (email?: string, name?: string, role?: PursuitRole) => {
        if (!email || !role) return;
        const key = email.toLowerCase();
        const existing = seen.get(key);
        if (existing && roleRank[existing.role] >= roleRank[role]) return;
        seen.set(key, {
          email: key,
          name: name?.trim() || email.split("@")[0],
          role,
        });
      };
      for (const r of oppRows) {
        add(r.owner_se_email, r.owner_se_name, "SA");
        add(r.owner_ae_email, r.owner_ae_name, "AE");
        add(r.manager_email, undefined, "SA Manager");
        add(r.director_email, undefined, "SA Director");
        add(r.vp_email, undefined, "SA VP");
        add(r.rvp_email, undefined, "Sales RVP");
        add(r.avp_email, undefined, "Sales AVP");
      }
      const members = Array.from(seen.values());
      await client.index({
        index: PURSUIT_TEAM_INDEX,
        id: account,
        document: {
          account,
          account_display: display,
          members,
          notes: `Auto-derived from data/opportunities.csv (${oppRows.length} opportunit${
            oppRows.length === 1 ? "y" : "ies"
          }). Edit on the Accounts page to override.`,
          updated_at: stamp,
          updated_by: "seed-opportunities",
        },
      });
      teamsUpserted++;
    }
    await client.indices.refresh({ index: PURSUIT_TEAM_INDEX });
  }

  console.log("\n--- Opportunity seed complete ---\n");
  console.log(`  CSV file:           ${csvPath}`);
  console.log(`  Opportunities:      ${upserted} upserted into ${OPP_INDEX}`);
  console.log(`  Pursuit teams:      ${teamsUpserted} upserted into ${PURSUIT_TEAM_INDEX}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
