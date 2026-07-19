"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList
} from "recharts";

interface DayRow {
  date: string;
  modelCostCents: number;
  cursorFeeCents: number;
  eventCount: number;
}

interface ModelRow {
  model: string;
  modelCostCents: number;
  cursorFeeCents: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  eventCount: number;
  isVerified?: boolean;
}

interface Summary {
  windowDays: number;
  isHourly: boolean;
  totals: {
    modelCostCents: number;
    cursorFeeCents: number;
    chargedCents: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    eventCount: number;
  };
  byDay: DayRow[];
  byModel: ModelRow[];
  syncStatus: {
    hasToken: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatChartLabel(iso: string, isHourly: boolean): string {
  const d = new Date(iso);
  if (isHourly) {
    return d.toLocaleString(undefined, { weekday: "short", hour: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatLastSynced(isoOrMs: string | number): string {
  const d = new Date(Number(isoOrMs));
  const datePart = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  
  // Extract timezone abbreviation like "GMT+2" from the toString() output
  const match = d.toString().match(/\(([^)]+)\)$/);
  const tz = match ? match[1] : '';

  return `${datePart} ${timePart} ${tz ? `(${tz})` : ''}`.trim();
}

const WINDOW_OPTIONS: (number | "today")[] = ["today", 7, 30, 90];

const CustomBarTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl p-3 text-sm min-w-[180px] transition-colors">
        <div className="text-neutral-900 dark:text-neutral-200 font-medium mb-3 border-b border-neutral-100 dark:border-neutral-700 pb-2 transition-colors">{data.model}</div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-neutral-500 dark:text-neutral-400 text-xs">Cost</span>
            <span className="text-emerald-500 dark:text-emerald-400 font-medium">${data.modelCostDollars.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-neutral-500 dark:text-neutral-400 text-xs">Requests</span>
            <span className="text-neutral-900 dark:text-neutral-200">{data.eventCount.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const CustomAreaTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl p-3 text-sm min-w-[160px] transition-colors">
        <div className="text-neutral-500 dark:text-neutral-400 text-xs mb-3 border-b border-neutral-100 dark:border-neutral-700 pb-2 transition-colors">{label}</div>
        <div className="space-y-1.5">
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex justify-between items-center">
              <span className="text-neutral-600 dark:text-neutral-300 text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                {p.name}
              </span>
              <span className="text-neutral-900 dark:text-white font-medium">${p.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

function DashboardSkeleton() {
  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-6 animate-pulse">
      {/* Left Column: Stats & Charts */}
      <div className="xl:col-span-6 2xl:col-span-7 flex flex-col gap-4 xl:gap-6 min-w-0 h-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3 shrink-0">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/30 p-2.5 sm:p-3 h-[72px] flex flex-col justify-center">
              <div className="h-2.5 w-16 bg-neutral-200 dark:bg-neutral-700 rounded mb-2"></div>
              <div className="h-5 w-20 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/40 p-4 sm:p-5 flex-1 min-h-[160px] flex flex-col">
          <div className="h-5 w-32 bg-neutral-200 dark:bg-neutral-700 rounded mb-4 shrink-0"></div>
          <div className="flex-1 bg-neutral-100 dark:bg-neutral-800/50 rounded min-h-0"></div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/40 p-4 sm:p-5 flex-1 min-h-[160px] flex flex-col">
          <div className="h-5 w-24 bg-neutral-200 dark:bg-neutral-700 rounded mb-4 shrink-0"></div>
          <div className="flex-1 bg-neutral-100 dark:bg-neutral-800/50 rounded min-h-0"></div>
        </div>
      </div>

      {/* Right Column: Table */}
      <div className="xl:col-span-6 2xl:col-span-5 min-w-0 h-[500px] xl:h-auto xl:min-h-0">
        <div className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/40 flex flex-col h-full w-full min-w-0">
          <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
            <div className="h-5 w-40 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
          </div>
          <div className="p-4 sm:p-5 space-y-6 flex-1 overflow-hidden">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="space-y-2.5">
                  <div className="h-4 w-32 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
                  <div className="h-2.5 w-24 bg-neutral-200 dark:bg-neutral-700 rounded sm:hidden"></div>
                </div>
                <div className="flex gap-4">
                  <div className="h-4 w-8 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
                  <div className="h-4 w-12 bg-neutral-200 dark:bg-neutral-700 rounded hidden sm:block"></div>
                  <div className="h-4 w-12 bg-neutral-200 dark:bg-neutral-700 rounded hidden sm:block"></div>
                  <div className="h-4 w-16 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ModelPricing {
  modelName: string;
  inputPerM: number;
  outputPerM: number;
  cacheWritePerM: number;
  cacheReadPerM: number;
  isVerified: boolean;
}

export default function DashboardPage() {
  const [days, setDays] = useState<number | "custom" | "today">("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [allModels, setAllModels] = useState<ModelPricing[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{text: string, isError: boolean} | null>(null);

  useEffect(() => {
    fetch("/api/admin/pricing")
      .then((res) => res.json())
      .then(setAllModels)
      .catch(console.error);
  }, []);

  const fetchDashboardData = () => {
    setLoading(true);
    setError(null);
    
    const params = new URLSearchParams();
    if (days === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      params.set("start", String(today.getTime()));
    } else if (days !== "custom") {
      params.set("days", String(days));
    } else {
      if (customStart) {
        // use local timezone midnight
        const start = new Date(customStart + "T00:00:00");
        params.set("start", String(start.getTime()));
      }
      if (customEnd) {
        // use local timezone 23:59:59
        const end = new Date(customEnd + "T23:59:59");
        params.set("end", String(end.getTime()));
      }
    }
    
    if (selectedModels.length > 0) {
      params.set("models", selectedModels.join(","));
    }

    fetch(`/api/summary?${params.toString()}`)
      .then(async (res) => {
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        if (!res.ok) {
          throw new Error(json?.error ?? `Request failed with status ${res.status}`);
        }
        return json as Summary;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, customStart, customEnd, selectedModels]);

  async function triggerSync() {
    setSyncing(true);
    setMessage(null);
    const res = await fetch("/api/admin/sync", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    
    if (res.ok) {
      setMessage({ text: `Successfully synced ${data.eventCount} events.`, isError: false });
      fetchDashboardData();
    } else {
      setMessage({ text: `Sync failed: ${data.error ?? "unknown error"}`, isError: true });
    }
  }

  // Provide a safe default so it doesn't break if `data` is still loading
  const chartData = useMemo(
    () =>
      (data?.byDay ?? []).map((d) => ({
        ...d,
        label: formatChartLabel(d.date, !!data?.isHourly),
        modelCostDollars: d.modelCostCents / 100,
        cursorFeeDollars: d.cursorFeeCents / 100,
      })),
    [data]
  );

  const modelChartData = useMemo(
    () =>
      (data?.byModel ?? []).map((m) => ({
        ...m,
        modelCostDollars: m.modelCostCents / 100,
      })),
    [data]
  );

  const needsAttention =
    data && (!data.syncStatus?.hasToken || data.syncStatus?.lastSyncStatus === "error");

  return (
    <div className="flex flex-col gap-6 xl:h-[calc(100vh-7rem)] min-h-[600px] xl:min-h-0">
      <div className="flex items-center justify-between flex-wrap gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-300 transition-colors">
              Model spend tracked from your Cursor BYOK usage.
            </p>
            {data?.syncStatus?.lastSyncAt && (
              <span className="text-xs text-neutral-600 bg-neutral-100 border border-neutral-200 dark:text-neutral-300 dark:bg-neutral-800/60 px-2 py-0.5 rounded-full dark:border-neutral-700/50 transition-colors">
                Last synced: {formatLastSynced(data.syncStatus.lastSyncAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-white/50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-700 rounded-lg p-1.5 transition-colors">
          {days === "custom" && (
            <div className="flex items-center gap-2 px-1">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md px-2 py-1 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors h-[28px]"
              />
              <span className="text-neutral-600 dark:text-neutral-400 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md px-2 py-1 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors h-[28px]"
              />
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md px-3 py-1 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors flex items-center gap-2 min-w-[120px] justify-between h-[28px]"
            >
              <span className="truncate max-w-[150px]">
                {selectedModels.length === 0
                  ? "All models"
                  : selectedModels.length === 1
                  ? selectedModels[0]
                  : `${selectedModels.length} models selected`}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500 shrink-0"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>

            {modelDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
                <div className="absolute top-full right-0 mt-1 w-64 max-h-60 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl z-50 py-1 transition-colors custom-scrollbar">
                  <div className="px-2 py-1.5 border-b border-neutral-100 dark:border-neutral-700 mb-1">
                    <button
                      onClick={() => {
                        setSelectedModels([]);
                        setModelDropdownOpen(false);
                      }}
                      className="text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    >
                      Clear selection
                    </button>
                  </div>
                  {allModels.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-neutral-500">No models found</div>
                  ) : (
                    allModels.map((m) => {
                      const isSelected = selectedModels.includes(m.modelName);
                      return (
                        <label key={m.modelName} className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            className="rounded border-neutral-300 dark:border-neutral-700"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                setSelectedModels(selectedModels.filter(s => s !== m.modelName));
                              } else {
                                setSelectedModels([...selectedModels, m.modelName]);
                              }
                            }}
                          />
                          <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate" title={m.modelName}>
                            {m.modelName}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-1"></div>

          <div className="flex rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden transition-colors">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setDays(opt)}
                className={`text-xs px-2.5 py-1.5 transition-colors h-[28px] ${
                  days === opt
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-medium"
                    : "bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {typeof opt === "number" ? `${opt}d` : "Today"}
              </button>
            ))}
            <button
              onClick={() => setDays("custom")}
              className={`text-xs px-2.5 py-1.5 transition-colors h-[28px] ${
                days === "custom"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-medium"
                  : "bg-white text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              Custom
            </button>
          </div>

          <button
            onClick={triggerSync}
            disabled={syncing || (!data?.syncStatus?.hasToken && !loading)}
            className="flex items-center gap-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-900 dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/5 dark:text-white text-xs font-medium px-3 py-1.5 transition-all disabled:opacity-50 min-w-[70px] justify-center h-[28px]"
            title={(!data?.syncStatus?.hasToken && !loading) ? "Configure token in Admin first" : "Sync latest events"}
          >
            {syncing ? (
              <>
                <svg className="animate-spin -ml-1 mr-0.5 h-3 w-3 text-neutral-900 dark:text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Syncing
              </>
            ) : "Sync"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 transition-colors">
          {error}. Check that <code className="text-xs">DATABASE_URL</code> is set and{" "}
          <code className="text-xs">npm run db:push</code> has been run against it.
        </div>
      )}

      {needsAttention && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 transition-colors">
          {!data?.syncStatus?.hasToken
            ? "No Cursor session token configured yet. Head to Admin to add one."
            : `Last sync failed: ${data?.syncStatus?.lastSyncError ?? "unknown error"}. Refresh the session token in Admin.`}
        </div>
      )}

      {loading && !data ? (
        <DashboardSkeleton />
      ) : !data ? null : (
        <div className={`flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-6 transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          {/* Left Column: Stats & Charts */}
          <div className="xl:col-span-6 2xl:col-span-7 flex flex-col gap-4 xl:gap-6 min-w-0 h-full">
            {/* Unified Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
              <MiniStatCard label="Total Cost" value={dollars(data.totals.modelCostCents + data.totals.cursorFeeCents)} accent />
              <MiniStatCard label="Requests" value={String(data.totals.eventCount)} />
              <MiniStatCard label="Input Tokens" value={formatTokens(data.totals.inputTokens)} />
              <MiniStatCard label="Output Tokens" value={formatTokens(data.totals.outputTokens)} />
              <MiniStatCard label="Cache Read" value={formatTokens(data.totals.cacheReadTokens)} />
              <MiniStatCard label="Cache Write" value={formatTokens(data.totals.cacheWriteTokens)} />
            </div>

            {/* Spend by model chart */}
            <section className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/40 p-4 sm:p-5 transition-colors shadow-sm flex flex-col flex-1 min-h-[250px] xl:min-h-[160px]">
              <h2 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-white mb-3 sm:mb-4 transition-colors shrink-0">Spend by model</h2>
              <div className="flex-1 min-h-0 relative">
                <div className="absolute inset-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modelChartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-200 dark:text-neutral-700" horizontal={true} vertical={false} />
                      <XAxis type="number" stroke="currentColor" className="text-neutral-500 dark:text-neutral-400" fontSize={11} tickFormatter={(v) => `$${v}`} axisLine={false} tickLine={false} />
                      <YAxis
                        dataKey="model"
                        type="category"
                        width={240}
                        stroke="currentColor"
                        className="text-neutral-600 dark:text-neutral-300"
                        fontSize={11}
                        axisLine={true}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'currentColor', className: 'text-neutral-100 dark:text-neutral-700/50', opacity: 0.5 }} />
                      <Bar dataKey="modelCostDollars" fill="#818cf8" radius={[0, 4, 4, 0]} barSize={20}>
                        <LabelList
                          dataKey="modelCostDollars"
                          position="right"
                          fill="currentColor"
                          className="text-neutral-600 dark:text-neutral-300 font-medium"
                          fontSize={11}
                          formatter={(v: number) => `$${v.toFixed(2)}`}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Daily spend chart */}
            <section className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/40 p-4 sm:p-5 transition-colors shadow-sm flex flex-col flex-1 min-h-[250px] xl:min-h-[160px]">
              <h2 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-white mb-3 sm:mb-4 transition-colors shrink-0">Daily spend</h2>
              <div className="flex-1 min-h-0 relative">
                <div className="absolute inset-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 15 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-200 dark:text-neutral-700" vertical={false} />
                      <XAxis dataKey="label" stroke="currentColor" className="text-neutral-500 dark:text-neutral-400" fontSize={11} axisLine={false} tickLine={false} dy={10} />
                      <YAxis
                        stroke="currentColor"
                        className="text-neutral-500 dark:text-neutral-400"
                        fontSize={11}
                        tickFormatter={(v) => `$${v}`}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomAreaTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="modelCostDollars"
                        name="Model cost"
                        stackId="1"
                        stroke="#818cf8"
                        strokeWidth={2}
                        fill="#818cf8"
                        fillOpacity={0.2}
                        activeDot={{ r: 4, fill: '#818cf8', stroke: '#fff', strokeWidth: 1 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="cursorFeeDollars"
                        name="Cursor fee"
                        stackId="1"
                        stroke="#f472b6"
                        strokeWidth={2}
                        fill="#f472b6"
                        fillOpacity={0.2}
                        activeDot={{ r: 4, fill: '#f472b6', stroke: '#fff', strokeWidth: 1 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </div>

      {/* Right Column: Table */}
      <div className="xl:col-span-6 2xl:col-span-5 min-w-0 h-[500px] xl:h-auto xl:min-h-0">
            <section className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/40 flex flex-col h-full w-full min-w-0 transition-colors shadow-sm">
              <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0 transition-colors">
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white transition-colors">By model breakdown</h2>
              </div>
              <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar min-w-0">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-neutral-50/95 dark:bg-neutral-900/95 backdrop-blur z-10 transition-colors">
                    <tr className="text-left text-neutral-600 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 whitespace-nowrap transition-colors">
                      <th className="py-3 px-4 font-semibold">Model</th>
                      <th className="py-3 px-3 font-semibold text-right">Reqs</th>
                      <th className="py-3 px-3 font-semibold text-right">Token (IN/OUT)</th>
                      <th className="py-3 px-3 font-semibold text-right">Cache (W/R)</th>
                      <th className="py-3 px-4 font-semibold text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 transition-colors">
                    {data.byModel.map((m) => {
                      const pricing = allModels.find((p) => p.modelName === m.model);
                      return (
                      <tr key={m.model} className="group hover:bg-neutral-100 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 transition-colors font-medium truncate max-w-[120px] sm:max-w-[150px] md:max-w-[180px] xl:max-w-[150px] 2xl:max-w-[200px]" title={m.model}>
                                {m.model}
                              </span>
                              {m.isVerified === false && (
                                <span 
                                  className="shrink-0 bg-amber-500/10 text-amber-500/90 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/20 cursor-help"
                                  title="Pricing unverified"
                                >
                                  Unverified
                                </span>
                              )}
                              
                              {pricing && (
                                <div className="relative flex items-center group/tooltip">
                                  <svg className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-help transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                  </svg>
                                  
                                  <div className="absolute top-1/2 -translate-y-1/2 left-full ml-2 hidden group-hover/tooltip:block w-[260px] p-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs rounded-lg shadow-xl z-50">
                                    <div className="font-semibold mb-2 text-white dark:text-neutral-900 border-b border-white/20 dark:border-neutral-900/10 pb-1.5 break-words leading-tight">
                                      {m.model}
                                      <div className="text-[10px] font-normal opacity-75 mt-0.5">Pricing (per 1M tokens)</div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <div className="flex justify-between">
                                        <span className="text-white/70 dark:text-neutral-600">Input</span>
                                        <span className="font-medium">${pricing.inputPerM}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-white/70 dark:text-neutral-600">Output</span>
                                        <span className="font-medium">${pricing.outputPerM}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-white/70 dark:text-neutral-600">Cache Write</span>
                                        <span className="font-medium">${pricing.cacheWritePerM}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-white/70 dark:text-neutral-600">Cache Read</span>
                                        <span className="font-medium">${pricing.cacheReadPerM}</span>
                                      </div>
                                    </div>
                                    <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 border-[6px] border-transparent border-r-neutral-900 dark:border-r-white"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-neutral-900 dark:text-neutral-100 font-medium align-middle whitespace-nowrap transition-colors">
                          {m.eventCount.toLocaleString()}
                        </td>
                            {/* Desktop token view */}
                        <td className="py-3 px-3 text-right align-middle whitespace-nowrap transition-colors">
                          <div className="flex items-center justify-end gap-1 text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
                            <span className="text-blue-600 dark:text-blue-400" title="Input Tokens">
                              {formatTokens(m.inputTokens)}
                            </span>
                            <span className="text-neutral-300 dark:text-neutral-700">/</span>
                            <span className="text-emerald-600 dark:text-emerald-400" title="Output Tokens">
                              {formatTokens(m.outputTokens)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right align-middle whitespace-nowrap transition-colors">
                          <div className="flex items-center justify-end gap-1 text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
                            <span className="text-amber-600 dark:text-amber-400" title="Cache Write Tokens">
                              {formatTokens(m.cacheWriteTokens)}
                            </span>
                            <span className="text-neutral-300 dark:text-neutral-700">/</span>
                            <span className="text-purple-600 dark:text-purple-400" title="Cache Read Tokens">
                              {formatTokens(m.cacheReadTokens)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right align-middle whitespace-nowrap transition-colors">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                            {dollars(m.modelCostCents)}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                    {data.byModel.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-neutral-500 text-sm">
                          No usage events yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-neutral-100/90 dark:bg-neutral-800/90 border-t-2 border-neutral-300 dark:border-neutral-700 transition-colors sticky bottom-0 backdrop-blur-md z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] dark:shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    {data.byModel.length > 0 && (
                      <tr className="text-left font-semibold">
                        <td className="py-3 px-4 text-neutral-900 dark:text-white">
                          <div className="flex flex-col gap-1">
                            <span className="whitespace-nowrap font-bold">Total</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-neutral-900 dark:text-white align-middle whitespace-nowrap">
                          {data.totals.eventCount.toLocaleString()}
                        </td>
                        {/* Desktop token view */}
                        <td className="py-3 px-3 text-right align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 text-[11px] font-medium text-neutral-900 dark:text-white">
                            <span className="text-blue-600 dark:text-blue-400" title="Total Input Tokens">
                              {formatTokens(data.totals.inputTokens)}
                            </span>
                            <span className="text-neutral-300 dark:text-neutral-700">/</span>
                            <span className="text-emerald-600 dark:text-emerald-400" title="Total Output Tokens">
                              {formatTokens(data.totals.outputTokens)}
                            </span>
                          </div>
                        </td>
                        {/* Desktop cache view */}
                        <td className="py-3 px-3 text-right align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 text-[11px] font-medium text-neutral-900 dark:text-white">
                            <span className="text-amber-600 dark:text-amber-400" title="Total Cache Write Tokens">
                              {formatTokens(data.totals.cacheWriteTokens)}
                            </span>
                            <span className="text-neutral-300 dark:text-neutral-700">/</span>
                            <span className="text-purple-600 dark:text-purple-400" title="Total Cache Read Tokens">
                              {formatTokens(data.totals.cacheReadTokens)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right align-middle whitespace-nowrap">
                          <span className="text-emerald-700 dark:text-emerald-400 text-[15px] font-bold">
                            {dollars(data.totals.modelCostCents)}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}

      {message && (
        <div className={`fixed bottom-6 right-6 max-w-sm p-4 rounded-xl shadow-2xl border animate-in slide-in-from-bottom-8 fade-in duration-300 z-50 flex items-start gap-3 transition-colors ${
          message.isError 
            ? 'bg-red-50 dark:bg-red-950/95 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200' 
            : 'bg-white dark:bg-neutral-900/95 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-200'
        }`}>
          <div className="flex-1 text-sm font-medium pt-0.5">{message.text}</div>
          <button 
            onClick={() => setMessage(null)} 
            className={`p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity ${
              message.isError ? 'hover:bg-red-100 dark:hover:bg-red-900/50' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function MiniStatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/30 p-2.5 sm:p-3 flex flex-col justify-center transition-colors shadow-sm">
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis">{label}</div>
      <div className={`text-base sm:text-lg font-bold mt-1 ${accent ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-900 dark:text-neutral-100"}`}>
        {value}
      </div>
    </div>
  );
}
