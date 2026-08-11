import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/api-auth";
import { apiError } from "@/lib/api-response";
import { publishPlan } from "@/lib/plans";

const versionSchema = z.object({
  title: z.string().min(1),
  source: z.string().min(1),
  agentName: z.string().min(1).optional(),
  agentPrompt: z.string().optional(),
  force: z.boolean().optional(),
  baseVersion: z.number().int().positive().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const parsed = versionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;

  try {
    return NextResponse.json(await publishPlan({ actorId: actor.userId, planId: id, ...parsed.data }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
