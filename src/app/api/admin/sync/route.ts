import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync";
import { revalidateTag } from "next/cache";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  
  const result = await runSync({
    startDate: body.startDate ? Number(body.startDate) : undefined,
    endDate: body.endDate ? Number(body.endDate) : undefined,
  });
  
  if (result.ok) {
    // Purge cached data on successful sync so the Dashboard shows fresh data immediately
    // @ts-ignore
    revalidateTag('dashboard-summary');
    // @ts-ignore
    revalidateTag('admin-status');
    // In case new models were discovered during sync
    // @ts-ignore
    revalidateTag('pricing');
  }
  
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
