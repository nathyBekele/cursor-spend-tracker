"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Incorrect password.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-full flex-1 flex items-center justify-center transition-colors">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 p-6 space-y-4 shadow-sm transition-colors"
      >
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-white transition-colors">Cursor Spend Tracker</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 transition-colors">Enter the admin password to continue.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 px-3 py-2 text-sm text-neutral-900 dark:text-white outline-none focus:border-neutral-500 transition-colors"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-sm font-medium py-2 disabled:opacity-50 transition-colors hover:opacity-90"
        >
          {loading ? "Checking…" : "Log in"}
        </button>
      </form>
    </div>
  );
}
