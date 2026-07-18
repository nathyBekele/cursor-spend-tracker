import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSyncStatus } from "@/lib/sync";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";

interface DayRow {
  day: Date;
  model_cost: number;
  fee_cost: number;
  count: bigint;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const modelsParam = searchParams.get("models");
  const daysParam = searchParams.get("days");

  const endDate = endParam ? new Date(Number(endParam)) : new Date();
  
  let startDate: Date;
  if (startParam) {
    startDate = new Date(Number(startParam));
  } else {
    const days = Number(daysParam ?? "7") || 7;
    startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  }

  const models = modelsParam ? modelsParam.split(",").filter(Boolean) : [];

  try {
    const cacheKey = `summary-v4-${startDate.getTime()}-${endDate.getTime()}-${models.join(",")}`;
    const getCachedSummary = unstable_cache(
      async () => buildSummary(startDate, endDate, models),
      [cacheKey],
      { revalidate: 60, tags: ['dashboard-summary'] }
    );
    
    const data = await getCachedSummary();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load summary: ${message}` },
      { status: 500 }
    );
  }
}

async function buildSummary(startDate: Date, endDate: Date, models: string[]) {
  const modelFilter = models.length > 0 ? { in: models } : undefined;
  const whereClause = {
    occurredAt: { gte: startDate, lte: endDate },
    ...(modelFilter ? { model: modelFilter } : {})
  };

  const diffHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  const isHourly = diffHours <= 48;

  const [byDayRaw, byModel, totals, syncStatus, pricing] = await Promise.all([
    models.length > 0 
      ? isHourly
        ? prisma.$queryRaw<DayRow[]>`
            SELECT
              date_trunc('hour', "occurredAt") AS day,
              COALESCE(SUM("modelCostCents"), 0) AS model_cost,
              COALESCE(SUM("cursorFeeCents"), 0) AS fee_cost,
              COUNT(*) AS count
            FROM "UsageEvent"
            WHERE "occurredAt" >= ${startDate} AND "occurredAt" <= ${endDate}
              AND "model" IN (${Prisma.join(models)})
            GROUP BY day
            ORDER BY day ASC
          `
        : prisma.$queryRaw<DayRow[]>`
            SELECT
              date_trunc('day', "occurredAt") AS day,
              COALESCE(SUM("modelCostCents"), 0) AS model_cost,
              COALESCE(SUM("cursorFeeCents"), 0) AS fee_cost,
              COUNT(*) AS count
            FROM "UsageEvent"
            WHERE "occurredAt" >= ${startDate} AND "occurredAt" <= ${endDate}
              AND "model" IN (${Prisma.join(models)})
            GROUP BY day
            ORDER BY day ASC
          `
      : isHourly
        ? prisma.$queryRaw<DayRow[]>`
            SELECT
              date_trunc('hour', "occurredAt") AS day,
              COALESCE(SUM("modelCostCents"), 0) AS model_cost,
              COALESCE(SUM("cursorFeeCents"), 0) AS fee_cost,
              COUNT(*) AS count
            FROM "UsageEvent"
            WHERE "occurredAt" >= ${startDate} AND "occurredAt" <= ${endDate}
            GROUP BY day
            ORDER BY day ASC
          `
        : prisma.$queryRaw<DayRow[]>`
            SELECT
              date_trunc('day', "occurredAt") AS day,
              COALESCE(SUM("modelCostCents"), 0) AS model_cost,
              COALESCE(SUM("cursorFeeCents"), 0) AS fee_cost,
              COUNT(*) AS count
            FROM "UsageEvent"
            WHERE "occurredAt" >= ${startDate} AND "occurredAt" <= ${endDate}
            GROUP BY day
            ORDER BY day ASC
          `,
    prisma.usageEvent.groupBy({
      by: ["model"],
      where: whereClause,
      _sum: {
        modelCostCents: true,
        cursorFeeCents: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
      },
      _count: { _all: true },
      orderBy: { _sum: { modelCostCents: "desc" } },
    }),
    prisma.usageEvent.aggregate({
      where: whereClause,
      _sum: {
        modelCostCents: true,
        cursorFeeCents: true,
        chargedCents: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
      },
      _count: { _all: true },
    }),
    getSyncStatus(),
    prisma.modelPricing.findMany(),
  ]);

  const pricingMap = new Map(pricing.map((p) => [p.modelName, p.isVerified]));

  return {
    isHourly,
    totals: {
      modelCostCents: totals._sum.modelCostCents ?? 0,
      cursorFeeCents: totals._sum.cursorFeeCents ?? 0,
      chargedCents: totals._sum.chargedCents ?? 0,
      inputTokens: totals._sum.inputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      cacheReadTokens: totals._sum.cacheReadTokens ?? 0,
      cacheWriteTokens: totals._sum.cacheWriteTokens ?? 0,
      eventCount: totals._count._all,
    },
    byDay: byDayRaw.map((row) => ({
      date: row.day,
      modelCostCents: Number(row.model_cost),
      cursorFeeCents: Number(row.fee_cost),
      eventCount: Number(row.count),
    })),
    byModel: byModel.map((row) => ({
      model: row.model,
      modelCostCents: row._sum.modelCostCents ?? 0,
      cursorFeeCents: row._sum.cursorFeeCents ?? 0,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      cacheReadTokens: row._sum.cacheReadTokens ?? 0,
      cacheWriteTokens: row._sum.cacheWriteTokens ?? 0,
      eventCount: row._count._all,
      isVerified: pricingMap.get(row.model) ?? false,
    })),
    syncStatus,
  };
}

