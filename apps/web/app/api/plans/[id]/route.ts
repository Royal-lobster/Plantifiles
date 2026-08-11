import { db } from "@plantifiles/db";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/api-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const plan = await db.plan.findFirst({
    where: { id, workspace: { memberships: { some: { userId: actor.userId } } } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      visibility: true,
      publicSlug: true,
      workspace: { select: { slug: true, name: true, requiredApprovals: true } },
      currentVersion: {
        select: {
          id: true,
          number: true,
          source: true,
          changeSummary: true,
          changeSummaryProse: true,
          lintScore: true,
          lintReport: true,
          lintOverridden: true,
          agentName: true,
          agentPrompt: true,
          createdAt: true,
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  return NextResponse.json(plan);
}
