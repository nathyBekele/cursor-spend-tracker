"use client";

import { useEffect, useState } from "react";

interface ModelPricing {
  modelName: string;
  inputPerM: number;
  outputPerM: number;
  cacheWritePerM: number;
  cacheReadPerM: number;
  isVerified: boolean;
}

interface SyncStatus {
  hasToken: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncEventCount: string | null;
}

function formatDate(ms: string | null): string {
  if (!ms) return "never";
  return new Date(Number(ms)).toLocaleString();
}

function AdminSkeleton() {
  return (
    <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0 animate-pulse">
      {/* Left Column: Status & Token */}
      <div className="w-full xl:w-[480px] flex flex-col gap-6 shrink-0">
        {/* Sync Status Skeleton */}
        <div className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            <div className="h-5 w-16 bg-neutral-200 dark:bg-neutral-700 rounded-full"></div>
          </div>
          <div className="bg-white dark:bg-neutral-950 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <div className="h-4 w-32 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              <div className="h-4 w-12 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-neutral-100 dark:border-neutral-700">
              <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              <div className="h-4 w-32 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-neutral-100 dark:border-neutral-700">
              <div className="h-4 w-28 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              <div className="h-4 w-16 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            </div>
          </div>
        </div>

        {/* Cursor Session Token Skeleton */}
        <div className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/60 p-5 flex-1 flex flex-col min-h-[300px]">
          <div className="h-5 w-48 bg-neutral-200 dark:bg-neutral-700 rounded mb-2"></div>
          <div className="h-4 w-64 bg-neutral-200 dark:bg-neutral-700 rounded mb-4"></div>
          <div className="flex-1 w-full bg-neutral-100 dark:bg-neutral-950 rounded-lg border border-neutral-200 dark:border-neutral-700 mb-4"></div>
          <div className="h-10 w-24 bg-neutral-200 dark:bg-neutral-700 rounded-lg self-end"></div>
        </div>
      </div>

      {/* Right Column: Model Pricing */}
      <div className="flex-1 rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/60 p-5 flex flex-col h-full overflow-hidden">
        <div className="h-6 w-32 bg-neutral-200 dark:bg-neutral-700 rounded mb-4"></div>
        <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-800/60 rounded mb-2"></div>
        <div className="space-y-4 mt-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-neutral-100 dark:border-neutral-700 pb-4">
              <div className="flex-1 h-5 w-40 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              <div className="w-20 h-5 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              <div className="w-20 h-5 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              <div className="w-20 h-5 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              <div className="w-20 h-5 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
              <div className="w-16 h-8 bg-neutral-200 dark:bg-neutral-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{text: string, isError: boolean} | null>(null);
  
  // Format for datetime-local: "YYYY-MM-DDThh:mm"
  function formatDateForInput(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  const [syncStartDate, setSyncStartDate] = useState("");
  const [syncEndDate, setSyncEndDate] = useState("");
  
  const [pricingModels, setPricingModels] = useState<ModelPricing[]>([]);
  const [editingPricing, setEditingPricing] = useState<ModelPricing | null>(null);
  const [pricingSaving, setPricingSaving] = useState(false);

  const [loading, setLoading] = useState(true);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/token");
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setStatus(data);
      } else {
        setMessage({ text: data?.error ?? `Failed to load status (${res.status})`, isError: true });
      }
      
      // Also load pricing models
      const pRes = await fetch("/api/admin/pricing");
      if (pRes.ok) {
        setPricingModels(await pRes.json());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    loadStatus();
  }, []);

  async function saveToken(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setSaving(false);
    if (res.ok) {
      setToken("");
      setMessage({ text: "Token saved successfully.", isError: false });
      await loadStatus();
    } else {
      setMessage({ text: "Failed to save token.", isError: true });
    }
  }

  async function triggerSync() {
    setSyncing(true);
    setMessage(null);

    const body: Record<string, number> = {};
    if (syncStartDate) {
      body.startDate = new Date(syncStartDate).getTime();
    }
    if (syncEndDate) {
      body.endDate = new Date(syncEndDate).getTime();
    }

    const res = await fetch("/api/admin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    });
    
    const data = await res.json();
    setSyncing(false);
    
    if (res.ok) {
      setMessage({ text: `Successfully synced ${data.eventCount} events.`, isError: false });
    } else {
      setMessage({ text: `Sync failed: ${data.error ?? "unknown error"}`, isError: true });
    }
    await loadStatus();
  }

  async function savePricing(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPricing) return;
    setPricingSaving(true);
    const res = await fetch("/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingPricing),
    });
    setPricingSaving(false);
    if (res.ok) {
      setEditingPricing(null);
      setMessage({ text: "Pricing saved successfully.", isError: false });
      await loadStatus();
    } else {
      const data = await res.json();
      setMessage({ text: `Failed to save pricing: ${data.error}`, isError: true });
    }
  }

  const statusBadge =
    status?.lastSyncStatus === "ok" ? (
      <span className="text-emerald-400">healthy</span>
    ) : status?.lastSyncStatus === "error" ? (
      <span className="text-red-400">error</span>
    ) : (
      <span className="text-neutral-500">not synced yet</span>
    );

  return (
    <div className="space-y-6 flex flex-col xl:h-[calc(100vh-7rem)] min-h-[600px] xl:min-h-0">
      <div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 transition-colors">
          Manage the Cursor session token used to pull usage data, and trigger manual syncs.
        </p>
      </div>

      {loading && !status ? (
        <AdminSkeleton />
      ) : (
        <div className={`flex flex-col xl:flex-row gap-6 flex-1 min-h-0 transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          {/* Left Column: Status & Token */}
          <div className="w-full xl:w-[480px] flex flex-col gap-6 shrink-0 xl:overflow-y-auto custom-scrollbar xl:pb-4 xl:pr-1 min-h-0">
          <section className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/60 p-5 space-y-4 transition-colors shadow-sm shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-neutral-900 dark:text-white transition-colors">Sync status</h2>
          <div className="text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700 transition-colors">
            {statusBadge}
          </div>
        </div>
        
        <dl className="text-sm space-y-2 text-neutral-600 dark:text-neutral-300 transition-colors bg-white dark:bg-neutral-950 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
          <div className="flex justify-between items-center">
            <dt className="text-neutral-500">Token configured</dt>
            <dd className="font-medium">{status?.hasToken ? <span className="text-emerald-500 dark:text-emerald-400">Yes</span> : <span className="text-amber-500 dark:text-amber-400">No</span>}</dd>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-neutral-100 dark:border-neutral-700">
            <dt className="text-neutral-500">Last sync</dt>
            <dd className="font-medium text-xs">{formatDate(status?.lastSyncAt ?? null)}</dd>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-neutral-100 dark:border-neutral-700">
            <dt className="text-neutral-500">Last sync events</dt>
            <dd className="font-medium">{status?.lastSyncEventCount ?? "—"}</dd>
          </div>
          {status?.lastSyncStatus === "error" && status.lastSyncError && (
            <div className="pt-3 mt-1 border-t border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 text-xs break-words">
              {status.lastSyncError}
            </div>
          )}
        </dl>

        <div className="pt-4 pb-1 space-y-3 border-t border-neutral-200 dark:border-neutral-700 transition-colors">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 transition-colors">Manual Sync Range (Optional)</p>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <input 
              type="datetime-local" 
              value={syncStartDate}
              onChange={(e) => setSyncStartDate(e.target.value)}
              className="bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md px-2 py-1.5 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors w-full sm:w-[170px]" 
              title="Start Date"
            />
            <span className="text-neutral-500 text-sm whitespace-nowrap">to</span>
            <input 
              type="datetime-local" 
              value={syncEndDate}
              onChange={(e) => setSyncEndDate(e.target.value)}
              className="bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md px-2 py-1.5 text-[13px] text-neutral-900 dark:text-white outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors w-full sm:w-[170px]" 
              title="End Date"
            />
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">
            Leave blank to sync from the time of your last successful sync until now.
          </p>
        </div>

        <button
          onClick={triggerSync}
          disabled={syncing}
          className="rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-sm font-medium px-4 py-2 mt-4 disabled:opacity-50 flex items-center justify-center min-w-[120px] transition-all hover:opacity-90"
        >
          {syncing ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white dark:text-neutral-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Syncing…
            </>
          ) : "Sync now"}
        </button>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/60 p-5 space-y-4 transition-colors shadow-sm flex flex-col shrink-0">
        <div>
          <h2 className="font-medium text-neutral-900 dark:text-white transition-colors">Cursor session token</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1.5 transition-colors leading-relaxed">
            Open{" "}
            <a
              className="underline hover:text-neutral-700 dark:hover:text-neutral-200 font-medium"
              href="https://cursor.com/dashboard/usage"
              target="_blank"
              rel="noreferrer"
            >
              cursor.com/dashboard/usage
            </a>{" "}
            while logged in, open DevTools → Application → Cookies →{" "}
            <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded transition-colors font-semibold">cursor.com</code>,
            copy the <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded transition-colors font-semibold">
              WorkosCursorSessionToken
            </code>{" "}
            value, and paste it below. It stays in your database, never sent to the browser.
          </p>
        </div>
        <form onSubmit={saveToken} className="flex flex-col flex-1 gap-3 pt-2">
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste WorkosCursorSessionToken value here"
            className="flex-1 w-full rounded-lg border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950 px-3 py-3 text-xs font-mono text-neutral-900 dark:text-white outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-colors resize-none min-h-[80px]"
          />
          <button
            type="submit"
            disabled={saving || !token.trim()}
            className="rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-sm font-medium px-4 py-2.5 disabled:opacity-50 transition-colors hover:opacity-90 w-full mt-auto"
          >
            {saving ? "Saving…" : "Save token"}
          </button>
        </form>
      </section>
        </div>

        {/* Right Column: Pricing */}
        <div className="flex-1 min-w-0 flex flex-col pt-1 xl:pt-0">
          <section className="rounded-xl border border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/60 p-5 space-y-4 transition-colors flex flex-col h-full min-h-[500px] xl:min-h-0 shadow-sm min-w-0">
            <div>
              <h2 className="font-medium text-neutral-900 dark:text-white transition-colors">Model Pricing</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 transition-colors">
                Configure fallback pricing for models (per 1M tokens). If a sync discovers an unknown model, it is automatically added with unverified defaults.
              </p>
            </div>
            
            <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar border border-neutral-200 dark:border-neutral-700 rounded-lg min-w-0">
              <table className="w-full text-left text-[13px] whitespace-nowrap text-neutral-700 dark:text-neutral-300 transition-colors">
                <thead className="sticky top-0 bg-neutral-100/95 dark:bg-neutral-950/95 backdrop-blur z-10 transition-colors">
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 transition-colors">
                    <th className="py-2.5 px-3 font-medium">Model</th>
                    <th className="py-2.5 px-3 font-medium">Input</th>
                    <th className="py-2.5 px-3 font-medium">Output</th>
                    <th className="py-2.5 px-3 font-medium">Write (cache)</th>
                    <th className="py-2.5 px-3 font-medium">Read (cache)</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                  {pricingModels.map((p) => {
                    const isEditing = editingPricing?.modelName === p.modelName;
                    const m = isEditing ? editingPricing : p;
                    
                    return (
                      <tr key={p.modelName} className="hover:bg-neutral-100 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-3">{p.modelName}</td>
                        {isEditing ? (
                          <>
                            <td className="py-2 px-3"><input type="number" step="any" value={m.inputPerM} onChange={(e) => setEditingPricing({...m, inputPerM: Number(e.target.value)})} className="w-16 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded px-1.5 py-1 text-neutral-900 dark:text-white transition-colors" /></td>
                            <td className="py-2 px-3"><input type="number" step="any" value={m.outputPerM} onChange={(e) => setEditingPricing({...m, outputPerM: Number(e.target.value)})} className="w-16 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded px-1.5 py-1 text-neutral-900 dark:text-white transition-colors" /></td>
                            <td className="py-2 px-3"><input type="number" step="any" value={m.cacheWritePerM} onChange={(e) => setEditingPricing({...m, cacheWritePerM: Number(e.target.value)})} className="w-16 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded px-1.5 py-1 text-neutral-900 dark:text-white transition-colors" /></td>
                            <td className="py-2 px-3"><input type="number" step="any" value={m.cacheReadPerM} onChange={(e) => setEditingPricing({...m, cacheReadPerM: Number(e.target.value)})} className="w-16 bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded px-1.5 py-1 text-neutral-900 dark:text-white transition-colors" /></td>
                            <td className="py-2 px-3 text-[11px]">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={m.isVerified} onChange={(e) => setEditingPricing({...m, isVerified: e.target.checked})} className="rounded border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950" />
                                <span>Verified</span>
                              </label>
                            </td>
                            <td className="py-2 px-3 space-x-2 text-right">
                              <button onClick={savePricing} disabled={pricingSaving} className="text-emerald-500 hover:underline">Save</button>
                              <button onClick={() => setEditingPricing(null)} disabled={pricingSaving} className="text-neutral-500 hover:underline">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 px-3">${p.inputPerM}</td>
                            <td className="py-2.5 px-3">${p.outputPerM}</td>
                            <td className="py-2.5 px-3">${p.cacheWritePerM}</td>
                            <td className="py-2.5 px-3">${p.cacheReadPerM}</td>
                            <td className="py-2.5 px-3">
                              {p.isVerified ? (
                                <span className="text-emerald-500 dark:text-emerald-500/90 font-medium">Verified</span>
                              ) : (
                                <span className="bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500/90 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">Unverified</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button onClick={() => setEditingPricing(p)} className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors">Edit</button>
                            </td>
                          </>
                        )}
                  </tr>
                );
              })}
              {pricingModels.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-neutral-500 italic">No models discovered yet. Sync to populate.</td>
                </tr>
              )}
            </tbody>
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
