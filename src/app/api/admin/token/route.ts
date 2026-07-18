import { NextRequest, NextResponse } from "next/server";
import { getSyncStatus, setSessionToken } from "@/lib/sync";
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function GET() {
  try {
    const getCachedStatus = unstable_cache(
      async () => getSyncStatus(),
      ['sync-status'],
      { revalidate: 30, tags: ['admin-status'] } // Cache for 30s
    );
    
    const status = await getCachedStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to load status: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  try {
    await setSessionToken(token);
    // @ts-ignore
    revalidateTag('admin-status'); // Invalidate cache so UI sees it immediately
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save token: ${errorMessage(err)}` },
      { status: 500 }
    );
  }
}
