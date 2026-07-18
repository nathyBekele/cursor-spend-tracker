import { prisma } from "./db";
import { CursorAuthError, fetchAllUsageEvents } from "./cursorClient";
import { findRate } from "./pricing";

export const SETTING_SESSION_TOKEN = "cursor_session_token";
export const SETTING_LAST_SYNC_AT = "last_sync_at";
export const SETTING_LAST_SYNC_STATUS = "last_sync_status"; // "ok" | "error"
export const SETTING_LAST_SYNC_ERROR = "last_sync_error";
export const SETTING_LAST_SYNC_EVENT_COUNT = "last_sync_event_count";

// First sync pulls this far back; later syncs only need to cover the gap
// since the last successful run, but we always overlap by a day to be safe.
const INITIAL_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
const OVERLAP_MS = 24 * 60 * 60 * 1000;

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getSessionToken(): Promise<string | null> {
  return getSetting(SETTING_SESSION_TOKEN);
}

export async function setSessionToken(token: string): Promise<void> {
  await setSetting(SETTING_SESSION_TOKEN, token);
}

export interface SyncResult {
  ok: boolean;
  eventCount: number;
  error?: string;
}

export async function runSync(options?: { startDate?: number; endDate?: number }): Promise<SyncResult> {
  const token = await getSessionToken();
  if (!token) {
    const error = "No Cursor session token configured yet.";
    await setSetting(SETTING_LAST_SYNC_STATUS, "error");
    await setSetting(SETTING_LAST_SYNC_ERROR, error);
    return { ok: false, eventCount: 0, error };
  }

  const lastSyncAtStr = await getSetting(SETTING_LAST_SYNC_AT);
  
  const now = Date.now();
  // By default if we have a last sync time, start from then (with a tiny 5-minute overlap to be safe)
  // Otherwise default to a 24h window
  const defaultStartDate = lastSyncAtStr 
    ? Number(lastSyncAtStr) - 5 * 60 * 1000 
    : now - 24 * 60 * 60 * 1000;

  const startDate = options?.startDate ?? defaultStartDate;
  const endDate = options?.endDate ?? now;

  try {
    const pricingRows = await prisma.modelPricing.findMany();
    const pricingMap = new Map(
      pricingRows.map((r) => [
        r.modelName,
        {
          inputPerM: r.inputPerM,
          outputPerM: r.outputPerM,
          cacheWritePerM: r.cacheWritePerM,
          cacheReadPerM: r.cacheReadPerM,
        },
      ])
    );

    const events = await fetchAllUsageEvents(token, {
      startDate,
      endDate,
    }, pricingMap);

    // Auto-insert any newly discovered models with default unverified pricing
    const uniqueModels = new Set(events.map((e) => e.model));
    const newModels = Array.from(uniqueModels).filter((m) => !pricingMap.has(m));
    if (newModels.length > 0) {
      await prisma.modelPricing.createMany({
        data: newModels.map((m) => {
          const rate = findRate(m);
          return {
            modelName: m,
            inputPerM: rate.inputPerM,
            outputPerM: rate.outputPerM,
            cacheWritePerM: rate.cacheWritePerM,
            cacheReadPerM: rate.cacheReadPerM,
            isVerified: false,
          };
        }),
        skipDuplicates: true, // Just in case
      });
    }

    // Process in batches to avoid slow sequential inserts over remote connections
    const batchSize = 100;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      await prisma.$transaction(
        batch.map((event) =>
          prisma.usageEvent.upsert({
            where: { id: event.id },
            create: {
              id: event.id,
              occurredAt: event.occurredAt,
              model: event.model,
              kind: event.kind,
              isTokenBasedCall: event.isTokenBasedCall,
              isHeadless: event.isHeadless,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              cacheWriteTokens: event.cacheWriteTokens,
              cacheReadTokens: event.cacheReadTokens,
              modelCostCents: event.modelCostCents,
              cursorFeeCents: event.cursorFeeCents,
              chargedCents: event.chargedCents,
              costSource: event.costSource,
              raw: event.raw as never,
            },
            update: {
              model: event.model,
              kind: event.kind,
              isTokenBasedCall: event.isTokenBasedCall,
              isHeadless: event.isHeadless,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              cacheWriteTokens: event.cacheWriteTokens,
              cacheReadTokens: event.cacheReadTokens,
              modelCostCents: event.modelCostCents,
              cursorFeeCents: event.cursorFeeCents,
              chargedCents: event.chargedCents,
              costSource: event.costSource,
              raw: event.raw as never,
            },
          })
        )
      );
    }

    await setSetting(SETTING_LAST_SYNC_AT, String(Date.now()));
    await setSetting(SETTING_LAST_SYNC_STATUS, "ok");
    await setSetting(SETTING_LAST_SYNC_ERROR, "");
    await setSetting(SETTING_LAST_SYNC_EVENT_COUNT, String(events.length));

    return { ok: true, eventCount: events.length };
  } catch (err) {
    const message =
      err instanceof CursorAuthError
        ? "Session token expired or invalid. Paste a fresh token in /admin."
        : err instanceof Error
          ? err.message
          : "Unknown sync error.";

    await setSetting(SETTING_LAST_SYNC_STATUS, "error");
    await setSetting(SETTING_LAST_SYNC_ERROR, message);

    return { ok: false, eventCount: 0, error: message };
  }
}

export interface SyncStatus {
  hasToken: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncEventCount: string | null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const [token, lastSyncAt, lastSyncStatus, lastSyncError, lastSyncEventCount] =
    await Promise.all([
      getSetting(SETTING_SESSION_TOKEN),
      getSetting(SETTING_LAST_SYNC_AT),
      getSetting(SETTING_LAST_SYNC_STATUS),
      getSetting(SETTING_LAST_SYNC_ERROR),
      getSetting(SETTING_LAST_SYNC_EVENT_COUNT),
    ]);

  return {
    hasToken: Boolean(token),
    lastSyncAt,
    lastSyncStatus,
    lastSyncError,
    lastSyncEventCount,
  };
}
