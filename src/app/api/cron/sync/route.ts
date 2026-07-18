import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";
import { revalidateTag } from "next/cache";

// Called by Vercel Cron (see vercel.json). This path is deliberately excluded
// from the admin-session gate in proxy.ts, so it authenticates itself with a
// separate CRON_SECRET instead of the admin cookie.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSync();
  
  if (result.ok) {
    // Purge cached data on successful sync
    // @ts-ignore
    revalidateTag('dashboard-summary');
    // @ts-ignore
    revalidateTag('admin-status');
    // @ts-ignore
    revalidateTag('pricing');
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
