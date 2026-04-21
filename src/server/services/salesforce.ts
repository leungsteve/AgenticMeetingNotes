import crypto from "node:crypto";

function randomHex(length: number): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

function fakeSfdcId(): string {
  return `00Q${randomHex(15)}`;
}

export interface SalesforceOpportunityUpdate {
  opportunityId: string;
  fields: Record<string, unknown>;
}

export interface SalesforceCallLog {
  opportunityId: string;
  subject: string;
  description: string;
  durationMinutes?: number;
  callDate?: string;
  actingUser: string;
}

export interface SalesforceTask {
  opportunityId: string;
  subject: string;
  description?: string;
  dueDate?: string;
  assignedTo: string;
  actingUser: string;
}

export interface SalesforceResult {
  success: boolean;
  id?: string;
  message: string;
  stub: boolean;
}

export interface SalesforceService {
  updateOpportunity(update: SalesforceOpportunityUpdate): Promise<SalesforceResult>;
  logCall(log: SalesforceCallLog): Promise<SalesforceResult>;
  createTask(task: SalesforceTask): Promise<SalesforceResult>;
}

const STUB_SUCCESS = (id: string): SalesforceResult => ({
  success: true,
  id,
  message: "Stub: queued for manual SFDC entry",
  stub: true,
});

export class StubSalesforceService implements SalesforceService {
  async updateOpportunity(_update: SalesforceOpportunityUpdate): Promise<SalesforceResult> {
    return Promise.resolve(STUB_SUCCESS(fakeSfdcId()));
  }

  async logCall(_log: SalesforceCallLog): Promise<SalesforceResult> {
    return Promise.resolve(STUB_SUCCESS(fakeSfdcId()));
  }

  async createTask(_task: SalesforceTask): Promise<SalesforceResult> {
    return Promise.resolve(STUB_SUCCESS(fakeSfdcId()));
  }
}

class LiveSalesforceService implements SalesforceService {
  async updateOpportunity(_update: SalesforceOpportunityUpdate): Promise<SalesforceResult> {
    throw new Error("Salesforce live mode is not implemented yet; set SALESFORCE_MODE to a value other than 'live'.");
  }

  async logCall(_log: SalesforceCallLog): Promise<SalesforceResult> {
    throw new Error("Salesforce live mode is not implemented yet; set SALESFORCE_MODE to a value other than 'live'.");
  }

  async createTask(_task: SalesforceTask): Promise<SalesforceResult> {
    throw new Error("Salesforce live mode is not implemented yet; set SALESFORCE_MODE to a value other than 'live'.");
  }
}

export function createSalesforceService(): SalesforceService {
  if (process.env.SALESFORCE_MODE === "live") {
    return new LiveSalesforceService();
  }
  return new StubSalesforceService();
}
