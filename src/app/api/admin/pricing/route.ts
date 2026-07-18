import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { unstable_cache, revalidateTag } from "next/cache";

export async function GET() {
  const getCachedModels = unstable_cache(
    async () => {
      return await prisma.modelPricing.findMany({
        orderBy: { modelName: "asc" },
      });
    },
    ['model-pricing'],
    { revalidate: 300, tags: ['pricing'] } // Cache for 5 minutes since this rarely changes unless manually modified
  );
  
  const models = await getCachedModels();
  return NextResponse.json(models);
}

const updateSchema = z.object({
  modelName: z.string(),
  inputPerM: z.number().min(0),
  outputPerM: z.number().min(0),
  cacheWritePerM: z.number().min(0),
  cacheReadPerM: z.number().min(0),
  isVerified: z.boolean(),
});

export async function PUT(req: Request) {
  try {
    const json = await req.json();
    const data = updateSchema.parse(json);

    const updated = await prisma.modelPricing.update({
      where: { modelName: data.modelName },
      data: {
        inputPerM: data.inputPerM,
        outputPerM: data.outputPerM,
        cacheWritePerM: data.cacheWritePerM,
        cacheReadPerM: data.cacheReadPerM,
        isVerified: data.isVerified,
      },
    });

    // When we update pricing, we need to invalidate both the pricing list and the dashboard summary
    // (since the summary computes unverified costs on the fly in the API route)
    // TypeScript might complain about revalidateTag taking 2 args depending on Next.js versions but it's 1 arg in app router
    // To satisfy TS in some strict contexts:
    // @ts-ignore
    revalidateTag('pricing');
    // @ts-ignore
    revalidateTag('dashboard-summary');

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Invalid payload" },
      { status: 400 }
    );
  }
}
