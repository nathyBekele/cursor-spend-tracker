import { createHash } from "crypto";
import { estimateCostCents } from "./pricing";

/**
 * Client for Cursor's UNDOCUMENTED personal dashboard usage API.
 *
 * There is no official public API for individual (non-Team) account usage.
 * The Cursor web app itself calls these same endpoints from the browser,
 * authenticated with the `WorkosCursorSessionToken` cookie from an active
 * cursor.com session. This can break if Cursor changes the shape of these
 * endpoints — that's why every raw event is stored untouched in the DB
 * (see `raw` column) and parsing below is defensive.
 *
 * If ingestion starts silently returning zero events, open
 * https://cursor.com/dashboard/usage, check the Network tab for
 * `get-filtered-usage-events` / `usage-summary`, and adjust the field
 * mapping in `mapRawEvent` below to match what you see.
 */

const CURSOR_BASE_URL = "https://cursor.com";

export class CursorAuthError extends Error {
  constructor(message = "Cursor session token is missing, expired, or invalid.") {
    super(message);
    this.name = "CursorAuthError";
  }
}

async function cursorFetch(
  path: string,
  sessionToken: string,
  init: RequestInit = {}
): Promise<unknown> {
  const res = await fetch(`${CURSOR_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: `WorkosCursorSessionToken=${sessionToken}`,
      Origin: CURSOR_BASE_URL,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new CursorAuthError();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cursor API ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function fetchUsageSummary(sessionToken: string): Promise<unknown> {
  return cursorFetch("/api/usage-summary", sessionToken, { method: "GET" });
}

interface FetchEventsPageParams {
  startDate: number; // ms epoch
  endDate: number; // ms epoch
  page: number;
  pageSize: number;
}

async function fetchUsageEventsPage(
  sessionToken: string,
  params: FetchEventsPageParams
): Promise<unknown> {
  return cursorFetch("/api/dashboard/get-filtered-usage-events", sessionToken, {
    method: "POST",
    body: JSON.stringify({
      startDate: String(params.startDate),
      endDate: String(params.endDate),
      page: params.page,
      pageSize: params.pageSize,
    }),
  });
}

/** Pull the events array out of whatever envelope shape the response has. */
function extractEventsArray(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const key of ["usageEventsDisplay", "usageEvents", "events", "data", "items"]) {
      const val = obj[key];
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
  }
  return [];
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

export interface MappedUsageEvent {
  id: string;
  occurredAt: Date;
  model: string;
  kind: string | null;
  isTokenBasedCall: boolean;
  isHeadless: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  modelCostCents: number;
  cursorFeeCents: number;
  chargedCents: number;
  costSource: "cursor" | "estimated";
  raw: Record<string, unknown>;
}

function stableId(raw: Record<string, unknown>, index: number): string {
  const explicit = pick(raw, "id", "eventId", "usageEventId");
  if (typeof explicit === "string" && explicit) return explicit;

  const hash = createHash("sha1");
  hash.update(
    JSON.stringify({
      t: pick(raw, "timestamp", "createdAt"),
      m: pick(raw, "model"),
      u: pick(raw, "owningUser", "userId"),
      i: index,
    })
  );
  return hash.digest("hex");
}

export function mapRawEvent(raw: Record<string, unknown>, index: number): MappedUsageEvent {
  const timestampRaw = pick(raw, "timestamp", "createdAt", "eventTimestamp");
  const timestampMs = num(timestampRaw);
  const occurredAt = timestampMs > 0 ? new Date(timestampMs) : new Date();

  const model = String(pick(raw, "model", "modelName") ?? "unknown");
  const kind = pick(raw, "kind");

  const tokenUsageRaw = pick(raw, "tokenUsage", "token_usage");
  const tokenUsage =
    tokenUsageRaw && typeof tokenUsageRaw === "object"
      ? (tokenUsageRaw as Record<string, unknown>)
      : {};

  const inputTokens = num(pick(tokenUsage, "inputTokens", "input_tokens"));
  const outputTokens = num(pick(tokenUsage, "outputTokens", "output_tokens"));
  const cacheWriteTokens = num(pick(tokenUsage, "cacheWriteTokens", "cache_write_tokens"));
  const cacheReadTokens = num(pick(tokenUsage, "cacheReadTokens", "cache_read_tokens"));

  const cursorFeeCents = num(pick(raw, "cursorTokenFee", "cursor_token_fee"));

  const explicitModelCostCents = pick(tokenUsage, "totalCents", "total_cents");
  let modelCostCents: number;
  let costSource: "cursor" | "estimated";
  if (typeof explicitModelCostCents === "number") {
    modelCostCents = explicitModelCostCents;
    costSource = "cursor";
  } else {
    modelCostCents = estimateCostCents(model, {
      inputTokens,
      outputTokens,
      cacheWriteTokens,
      cacheReadTokens,
    });
    costSource = "estimated";
  }

  const explicitCharged = pick(raw, "chargedCents", "charged_cents");
  const chargedCents =
    typeof explicitCharged === "number" ? explicitCharged : modelCostCents + cursorFeeCents;

  return {
    id: stableId(raw, index),
    occurredAt,
    model,
    kind: typeof kind === "string" ? kind : null,
    isTokenBasedCall: Boolean(pick(raw, "isTokenBasedCall") ?? true),
    isHeadless: Boolean(pick(raw, "isHeadless") ?? false),
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    modelCostCents,
    cursorFeeCents,
    chargedCents,
    costSource,
    raw,
  };
}

interface FetchAllOptions {
  startDate: number;
  endDate: number;
  pageSize?: number;
  maxPages?: number;
}

/**
 * Paginate through every usage event in the window. Stops when a page comes
 * back empty or `maxPages` is hit (safety net against an infinite loop if
 * Cursor's pagination semantics change).
 */
export async function fetchAllUsageEvents(
  sessionToken: string,
  { startDate, endDate, pageSize = 100, maxPages = 500 }: FetchAllOptions
): Promise<MappedUsageEvent[]> {
  const all: MappedUsageEvent[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const json = await fetchUsageEventsPage(sessionToken, {
      startDate,
      endDate,
      page,
      pageSize,
    });
    const rawEvents = extractEventsArray(json);
    if (rawEvents.length === 0) break;

    rawEvents.forEach((raw, i) => all.push(mapRawEvent(raw, page * pageSize + i)));

    if (rawEvents.length < pageSize) break; // last page
  }

  return all;
}
